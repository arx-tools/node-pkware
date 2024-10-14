import { Buffer } from 'node:buffer'
import { type Transform, type TransformCallback } from 'node:stream'
import {
  ChBitsAsc,
  ChCodeAsc,
  Compression,
  DictionarySize,
  DistBits,
  DistCode,
  EMPTY_BUFFER,
  ExLenBits,
  LenBits,
  LenCode,
  LONGEST_ALLOWED_REPETITION,
} from '@src/constants.js'
import { InvalidCompressionTypeError, InvalidDictionarySizeError } from '@src/errors.js'
import { ExpandingBuffer } from '@src/ExpandingBuffer.js'
import { clamp, quotientAndRemainder, getLowestNBitsOf, nBitsOfOnes, repeat, toHex } from '@src/functions.js'
import { type StreamHandler } from '@src/stream.js'
import { type Config, type Stats } from '@src/types.js'

export function getSizeOfMatching(inputBytes: Buffer, a: number, b: number): number {
  const limit = clamp(2, LONGEST_ALLOWED_REPETITION, b - a)

  for (let i = 2; i <= limit; i++) {
    if (inputBytes[a + i] !== inputBytes[b + i]) {
      return i
    }
  }

  return limit
}

/**
 * TODO: make sure that we find the most recent one,
 * which in turn allows us to store backward length in less amount of bits
 * currently the code goes from the furthest point
 */
function findRepetitions(
  inputBytes: Buffer,
  endOfLastMatch: number,
  cursor: number,
): { size: number; distance: number } {
  const notEnoughBytes = inputBytes.length - cursor < 2
  const tooClose = cursor === endOfLastMatch || cursor - endOfLastMatch < 2
  if (notEnoughBytes || tooClose) {
    return { size: 0, distance: 0 }
  }

  const haystack = inputBytes.subarray(endOfLastMatch, cursor)
  const needle = inputBytes.subarray(cursor, cursor + 2)

  const matchIndex = haystack.indexOf(needle)
  if (matchIndex !== -1) {
    const distance = cursor - endOfLastMatch - matchIndex

    let size = 2
    if (distance > 2) {
      size = getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor)
    }

    return { distance: distance - 1, size }
  }

  return { size: 0, distance: 0 }
}

export class Implode {
  private readonly verbose: boolean
  private isFirstChunk: boolean
  private readonly inputBuffer: ExpandingBuffer
  private readonly outputBuffer: ExpandingBuffer
  private readonly stats: Stats
  private readonly compressionType: Exclude<Compression, Compression.Unknown>
  private readonly dictionarySize: Exclude<DictionarySize, DictionarySize.Unknown>
  private dictionarySizeMask: number
  private streamEnded: boolean
  private readonly distCodes: number[]
  private readonly distBits: number[]
  private startIndex: number
  private handledFirstTwoBytes: boolean
  private outBits: number
  private nChBits: number[]
  private nChCodes: number[]

  constructor(compressionType: Compression, dictionarySize: DictionarySize, config: Config) {
    if (!(compressionType in Compression) || compressionType === Compression.Unknown) {
      throw new InvalidCompressionTypeError()
    }

    if (!(dictionarySize in DictionarySize) || dictionarySize === DictionarySize.Unknown) {
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
    const instance = this

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
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

        const blockSize = 0x8_00

        if (instance.outputBuffer.size() <= blockSize) {
          callback(null, EMPTY_BUFFER)
          return
        }

        let [numberOfBlocks] = quotientAndRemainder(instance.outputBuffer.size(), blockSize)

        // making sure to leave one block worth of data for lookback when processing chunk data
        numberOfBlocks = numberOfBlocks - 1

        const numberOfBytes = numberOfBlocks * blockSize
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
      this.startIndex = 0

      if (!this.handledFirstTwoBytes) {
        if (this.inputBuffer.size() < 3) {
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
        // eslint-disable-next-line prefer-const -- this might get overriden while searching for repetitions
        let { size, distance } = findRepetitions(this.inputBuffer.read(endOfLastMatch), endOfLastMatch, this.startIndex)

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
            const byte = distance >> this.dictionarySize
            this.outputBits(this.distBits[byte], this.distCodes[byte])
            this.outputBits(this.dictionarySize, this.dictionarySizeMask & distance)
          }

          this.startIndex = this.startIndex + size
        }

        /*
        this.inputBuffer.dropStart(endOfLastMatch)
        this.startIndex -= endOfLastMatch
        endOfLastMatch = 0
        */

        if (this.dictionarySize === DictionarySize.Small && this.startIndex >= 0x4_00) {
          this.inputBuffer.dropStart(0x4_00)
          this.startIndex = this.startIndex - 0x4_00
        } else if (this.dictionarySize === DictionarySize.Medium && this.startIndex >= 0x8_00) {
          this.inputBuffer.dropStart(0x8_00)
          this.startIndex = this.startIndex - 0x8_00
        } else if (this.dictionarySize === DictionarySize.Large && this.startIndex >= 0x10_00) {
          this.inputBuffer.dropStart(0x10_00)
          this.startIndex = this.startIndex - 0x10_00
        }
      }

      // -------------------------------

      // this.inputBuffer.dropStart(this.inputBuffer.size())
      this.inputBuffer.clear()
    }

    if (this.streamEnded) {
      // Write the termination literal
      this.outputBits(this.nChBits.at(-1) as number, this.nChCodes.at(-1) as number)
    }
  }

  /**
   * @returns false - non flushable
   * @returns true - flushable
   * @returns null - flushable, but there might be a better repetition
   */
  private isRepetitionFlushable(size: number, distance: number): boolean | null {
    if (size === 0) {
      return false
    }

    // If we found repetition of 2 bytes, that is 0x1_00 or further back,
    // don't bother. Storing the distance of 0x1_00 bytes would actually
    // take more space than storing the 2 bytes as-is.
    if (size === 2 && distance >= 0x1_00) {
      return false
    }

    if (size >= 8 || this.startIndex + 1 >= this.inputBuffer.size()) {
      return true
    }

    return null
  }

  /**
   * repetitions are at least 2 bytes long,
   * so the initial 2 bytes can be moved to the output as is
   */
  private handleFirstTwoBytes(): void {
    const byte1 = this.inputBuffer.readByte(0)
    const byte2 = this.inputBuffer.readByte(1)
    this.outputBits(this.nChBits[byte1], this.nChCodes[byte1])
    this.outputBits(this.nChBits[byte2], this.nChCodes[byte2])
    this.startIndex = this.startIndex + 2
  }

  private setup(): void {
    switch (this.compressionType) {
      case Compression.Ascii: {
        for (let nCount = 0; nCount < 0x1_00; nCount++) {
          this.nChBits[nCount] = ChBitsAsc[nCount] + 1
          this.nChCodes[nCount] = ChCodeAsc[nCount] * 2
        }

        break
      }

      case Compression.Binary: {
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
      case DictionarySize.Small: {
        this.dictionarySizeMask = nBitsOfOnes(4)
        break
      }

      case DictionarySize.Medium: {
        this.dictionarySizeMask = nBitsOfOnes(5)
        break
      }

      case DictionarySize.Large: {
        this.dictionarySizeMask = nBitsOfOnes(6)
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

    this.outputBuffer.appendByte(this.compressionType)
    this.outputBuffer.appendByte(this.dictionarySize)
    this.outputBuffer.appendByte(0)
    this.outBits = 0
  }

  private outputBits(nBits: number, bitBuffer: number): void {
    if (nBits > 8) {
      this.outputBits(8, bitBuffer)
      bitBuffer = bitBuffer >> 8
      nBits = nBits - 8
    }

    const { outBits } = this

    const lastBytes = this.outputBuffer.readByte(this.outputBuffer.size() - 1)
    this.outputBuffer.setByte(-1, lastBytes | getLowestNBitsOf(bitBuffer << outBits, 8))

    this.outBits = this.outBits + nBits

    if (this.outBits > 8) {
      this.outBits = getLowestNBitsOf(this.outBits, 3)
      bitBuffer = bitBuffer >> (8 - outBits)
      this.outputBuffer.appendByte(getLowestNBitsOf(bitBuffer, 8))
    } else {
      this.outBits = getLowestNBitsOf(this.outBits, 3)
      if (this.outBits === 0) {
        this.outputBuffer.appendByte(0)
      }
    }
  }
}
