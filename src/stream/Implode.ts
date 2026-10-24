import { Buffer } from 'node:buffer'
import type { Transform, TransformCallback } from 'node:stream'
import {
  COMPRESSION_CODES,
  ChBitsAsc,
  ChCodeAsc,
  DICTIONARY_CODES,
  DistBits,
  DistCode,
  ExLenBits,
  LenBits,
  LenCode,
  LONGEST_ALLOWED_REPETITION,
} from '../constants.ts'
import { InvalidCompressionTypeError, InvalidDictionarySizeError } from '../errors.ts'
import { findRepetitions } from '../common/matchFinder.ts'
import { outputBits } from '../common/outputBits.ts'
import { isRepetitionFlushable } from '../common/repetitions.ts'
import { quotientAndRemainder, getLowestNBitsOf, nBitsOfOnes, repeat, toHex } from '../functions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'
import { ExpandingBuffer } from './ExpandingBuffer.ts'
import type { StreamHandler } from './stream.ts'
import type { Config, Stats } from './types.ts'

const BLOCK_SIZE_IN_BYTES = 0x8_00

/**
 * TODO: make sure that we find the most recent one,
 * which in turn allows us to store backward length in less amount of bits
 * currently the code goes from the furthest point.
 */
export class Implode {
  /**
   * The lookup table of the match finder: the key is the 16 bit combination of two bytes, the value is
   * the latest occurrence of it within the buffer.
   */
  lastOccurrences: Record<number, number> = {}
  /**
   * The bytes of the compressed data, the shared encoder writes them through the `OutputBuffer`
   * interface.
   */
  readonly outputBuffer: ExpandingBuffer
  /**
   * The number of the bits in the last, not yet complete byte of the output.
   */
  outBits: number

  private readonly verbose: boolean
  private isFirstChunk: boolean
  private readonly inputBuffer: ExpandingBuffer
  private readonly stats: Stats
  private readonly compressionType: CompressionType
  private readonly dictionarySize: DictionarySize
  private dictionarySizeMask: number
  private streamEnded: boolean
  private readonly distCodes: number[]
  private readonly distBits: number[]
  private startIndex: number
  private handledFirstTwoBytes: boolean
  private nChBits: number[]
  private nChCodes: number[]

  constructor(compressionType: CompressionType, dictionarySize: DictionarySize, config: Config) {
    // the type system covers the callers, but a plain javascript one can still pass anything
    if (!Object.hasOwn(COMPRESSION_CODES, compressionType)) {
      throw new InvalidCompressionTypeError()
    }

    if (!Object.hasOwn(DICTIONARY_CODES, dictionarySize)) {
      throw new InvalidDictionarySizeError()
    }

    this.verbose = config?.verbose ?? false
    this.isFirstChunk = true
    this.inputBuffer = new ExpandingBuffer(0x1_00_00)
    this.outputBuffer = new ExpandingBuffer(0x1_20_00)
    this.stats = { chunkCounter: 0 }
    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.dictionarySizeMask = -1
    this.streamEnded = false
    this.distCodes = structuredClone(DistCode)
    this.distBits = structuredClone(DistBits)
    this.startIndex = 0
    this.handledFirstTwoBytes = false
    this.outBits = 0
    this.nChBits = repeat(0, 0x3_06)
    this.nChCodes = repeat(0, 0x3_06)
  }

  getHandler(): StreamHandler {
    // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias -- the stream handler needs both values: this is the Transform, the alias is the encoder instance
    const instance = this

    return function (
      this: Transform,
      chunk: Buffer,
      encoding: NodeJS.BufferEncoding,
      callback: TransformCallback,
    ): void {
      try {
        instance.inputBuffer.append(chunk)

        if (instance.isFirstChunk) {
          instance.isFirstChunk = false
          this._flush = instance.onInputFinished.bind(instance)
        }

        if (instance.verbose) {
          instance.stats.chunkCounter = instance.stats.chunkCounter + 1
          console.log(`implode: reading ${toHex(chunk.length)} bytes from chunk #${instance.stats.chunkCounter}`)
        }

        instance.processChunkData()

        if (instance.outputBuffer.size() <= BLOCK_SIZE_IN_BYTES) {
          callback(null, Buffer.from([]))
          return
        }

        let [numberOfBlocks] = quotientAndRemainder(instance.outputBuffer.size(), BLOCK_SIZE_IN_BYTES)

        // making sure to leave one block worth of data for lookback when processing chunk data
        numberOfBlocks = numberOfBlocks - 1

        const numberOfBytes = numberOfBlocks * BLOCK_SIZE_IN_BYTES
        // make sure to create a copy of the output buffer slice as it will get flushed in the next line
        const output = Buffer.from(instance.outputBuffer.read(0, numberOfBytes))
        instance.outputBuffer.flushStart(numberOfBytes)

        if (instance.outBits === 0) {
          instance.outputBuffer.setByte(-1, 0)
        }

        callback(null, output)
      } catch (error: unknown) {
        callback(error as Error)
      }
    }
  }

  private onInputFinished(callback: TransformCallback): void {
    this.streamEnded = true

    try {
      this.processChunkData()

      if (this.verbose) {
        console.log('---------------')
        console.log('implode: total number of chunks read:', this.stats.chunkCounter)
        console.log('implode: inputBuffer heap size', toHex(this.inputBuffer.heapSize()))
        console.log('implode: outputBuffer heap size', toHex(this.outputBuffer.heapSize()))
      }

      callback(null, this.outputBuffer.read())
    } catch (error: unknown) {
      callback(error as Error)
    }
  }

  private processChunkData(): void {
    if (this.dictionarySizeMask === -1) {
      this.setup()
    }

    if (!this.inputBuffer.isEmpty()) {
      if (!this.handledFirstTwoBytes) {
        if (this.inputBuffer.isEmpty()) {
          return
        }

        this.handledFirstTwoBytes = true

        this.handleFirstTwoBytes()
      }

      // -------------------------------
      // work in progress

      // eslint-disable-next-line prefer-const -- this might get overriden while searching for repetitions
      let endOfLastMatch = 0 // used when searching for longer repetitions later

      while (this.startIndex < this.inputBuffer.size()) {
        // a repetition may reach into the data that has not arrived yet, and the size of the match would
        // be cut short at the end of the buffer, which would make the output depend on the chunk
        // boundaries. the encoder waits for the next chunk instead, unless the stream has ended.
        if (!this.streamEnded && this.inputBuffer.size() - this.startIndex <= LONGEST_ALLOWED_REPETITION) {
          break
        }

        // eslint-disable-next-line prefer-const -- this might get overriden while searching for repetitions
        let { size, distance } = findRepetitions(this, this.inputBuffer.read(0), this.startIndex)

        // eslint-disable-next-line prefer-const -- this might get overriden while searching for repetitions
        let isFlushable = this.isRepetitionFlushable(size, distance)

        if (isFlushable === false) {
          const byte = this.inputBuffer.readByte(this.startIndex)
          this.outputBits(this.nChBits[byte], this.nChCodes[byte])
          this.startIndex = this.startIndex + 1
        } else {
          if (isFlushable === null) {
            /*
            // Try to find better repetition 1 byte later.
            // stormlib/implode.c L517
            let cursor = this.startIndex
            let newSize = size
            let newDistance = distance
            let currentSize
            let currentDistance
            while (newSize <= currentSize && this.isRepetitionFlushable(newSize, newDistance)) {
              currentSize = newSize
              currentDistance = newDistance
              cursor = cursor + 1
              const reps = findRepetitions(this.inputBuffer.read(endOfLastMatch), endOfLastMatch, cursor)
              newSize = reps.size
              newDistance = reps.distance
            }
            size = newSize
            distance = currentDistance
            */
          }

          const byte = size + 0xfe
          this.outputBits(this.nChBits[byte], this.nChCodes[byte])
          if (size === 2) {
            const byte = distance >> 2
            this.outputBits(this.distBits[byte], this.distCodes[byte])
            this.outputBits(2, distance & 3)
          } else {
            const byte = distance >> DICTIONARY_CODES[this.dictionarySize]
            this.outputBits(this.distBits[byte], this.distCodes[byte])
            this.outputBits(DICTIONARY_CODES[this.dictionarySize], this.dictionarySizeMask & distance)
          }

          this.startIndex = this.startIndex + size
        }

        /*
        this.inputBuffer.dropStart(endOfLastMatch)
        this.startIndex -= endOfLastMatch
        endOfLastMatch = 0
        */

        if (this.dictionarySize === 'small' && this.startIndex >= 0x4_00) {
          this.inputBuffer.dropStart(0x4_00)
          this.startIndex = this.startIndex - 0x4_00
          this.lastOccurrences = {}
        } else if (this.dictionarySize === 'medium' && this.startIndex >= 0x8_00) {
          this.inputBuffer.dropStart(0x8_00)
          this.startIndex = this.startIndex - 0x8_00
          this.lastOccurrences = {}
        } else if (this.dictionarySize === 'large' && this.startIndex >= 0x10_00) {
          this.inputBuffer.dropStart(0x10_00)
          this.startIndex = this.startIndex - 0x10_00
          this.lastOccurrences = {}
        }
      }

      // -------------------------------
    }

    if (this.streamEnded) {
      // Write the termination literal
      this.outputBits(this.nChBits.at(-1) as number, this.nChCodes.at(-1) as number)
    }
  }

  /**
   * Tells whether the repetition can be flushed at the current position.
   *
   * @returns False when it is not flushable, true when it is, and null when it is flushable but a
   * better repetition might be found.
   */
  private isRepetitionFlushable(size: number, distance: number): boolean | null {
    return isRepetitionFlushable(size, distance, this.inputBuffer.size() - this.startIndex)
  }

  /**
   * Repetitions are at least 2 bytes long,
   * so the initial 2 bytes can be moved to the output as is.
   */
  private handleFirstTwoBytes(): void {
    const availableBytes = Math.min(2, this.inputBuffer.size() - this.startIndex)

    for (let index = 0; index < availableBytes; index++) {
      const byte = this.inputBuffer.readByte(index)

      this.outputBits(this.nChBits[byte], this.nChCodes[byte])
    }

    this.startIndex = this.startIndex + availableBytes
  }

  private setup(): void {
    switch (this.compressionType) {
      case 'ascii': {
        for (let nCount = 0; nCount < 0x1_00; nCount++) {
          this.nChBits[nCount] = ChBitsAsc[nCount] + 1
          this.nChCodes[nCount] = ChCodeAsc[nCount] * 2
        }

        break
      }

      case 'binary': {
        let nChCode = 0
        for (let nCount = 0; nCount < 0x1_00; nCount++) {
          this.nChBits[nCount] = 9
          this.nChCodes[nCount] = nChCode
          nChCode = getLowestNBitsOf(nChCode, 16) + 2
        }

        break
      }
    }

    switch (this.dictionarySize) {
      case 'small': {
        this.dictionarySizeMask = nBitsOfOnes(DICTIONARY_CODES.small)
        break
      }

      case 'medium': {
        this.dictionarySizeMask = nBitsOfOnes(DICTIONARY_CODES.medium)
        break
      }

      case 'large': {
        this.dictionarySizeMask = nBitsOfOnes(DICTIONARY_CODES.large)
        break
      }
    }

    let nCount = 0x1_00

    for (let i = 0; i < 0x10; i++) {
      for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
        this.nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
        this.nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | (LenCode[i] * 2) | 1
        nCount = nCount + 1
      }
    }

    this.outputBuffer.appendByte(COMPRESSION_CODES[this.compressionType])
    this.outputBuffer.appendByte(DICTIONARY_CODES[this.dictionarySize])
    this.outputBuffer.appendByte(0)
    this.outBits = 0
  }

  private outputBits(numberOfBits: number, bitBuffer: number): void {
    outputBits(this, numberOfBits, bitBuffer)
  }
}
