import { Buffer } from 'node:buffer'
import { Transform, TransformCallback } from 'node:stream'
import {
  ChBitsAsc,
  ChCodeAsc,
  Compression,
  DictionarySize,
  DistBits,
  DistCode,
  ExLenBits,
  LenBits,
  LenCode,
  LONGEST_ALLOWED_REPETITION,
} from './constants'
import { InvalidCompressionTypeError, InvalidDictionarySizeError } from './errors'
import { ExpandingBuffer } from './ExpandingBuffer'
import { clamp, clone, evenAndRemainder, getLowestNBits, last, nBitsOfOnes, repeat, toHex } from './functions'
import { Config, Stats } from './types'

export const getSizeOfMatching = (inputBytes: Buffer, a: number, b: number) => {
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
const findRepetitions = (inputBytes: Buffer, endOfLastMatch: number, cursor: number) => {
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
    return {
      distance: distance - 1,
      size: distance > 2 ? getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor) : 2,
    }
  }

  return { size: 0, distance: 0 }
}

export class Implode {
  #verbose: boolean
  #isFirstChunk: boolean = true
  #inputBuffer: ExpandingBuffer
  #outputBuffer: ExpandingBuffer
  #stats: Stats = { chunkCounter: 0 }
  #compressionType: Compression = Compression.Unknown
  #dictionarySize: DictionarySize = DictionarySize.Unknown
  #dictionarySizeMask: number = -1
  #streamEnded: boolean = false
  #distCodes: number[] = clone(DistCode)
  #distBits: number[] = clone(DistBits)
  #startIndex: number = 0
  #handledFirstTwoBytes: boolean = false
  #outBits: number = 0
  #nChBits: number[] = repeat(0, 0x306)
  #nChCodes: number[] = repeat(0, 0x306)

  constructor(compressionType: Compression, dictionarySize: DictionarySize, config: Config) {
    if (!(compressionType in Compression) || compressionType === Compression.Unknown) {
      throw new InvalidCompressionTypeError()
    }

    if (!(dictionarySize in DictionarySize) || dictionarySize === DictionarySize.Unknown) {
      throw new InvalidDictionarySizeError()
    }

    this.#compressionType = compressionType
    this.#dictionarySize = dictionarySize
    this.#verbose = config?.verbose ?? false
    this.#inputBuffer = new ExpandingBuffer(config?.inputBufferSize ?? 0)
    this.#outputBuffer = new ExpandingBuffer(config?.outputBufferSize ?? 0)
  }

  getHandler() {
    const instance = this

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
      try {
        instance.#inputBuffer.append(chunk)

        if (instance.#isFirstChunk) {
          instance.#isFirstChunk = false
          this._flush = instance.#onInputFinished.bind(instance)
        }

        if (instance.#verbose) {
          instance.#stats.chunkCounter++
          console.log(`implode: reading ${toHex(chunk.length)} bytes from chunk #${instance.#stats.chunkCounter}`)
        }

        instance.#processChunkData()

        const blockSize = 0x800

        if (instance.#outputBuffer.size() <= blockSize) {
          callback(null, Buffer.from([]))
          return
        }

        let [numberOfBlocks] = evenAndRemainder(blockSize, instance.#outputBuffer.size())

        // making sure to leave one block worth of data for lookback when processing chunk data
        numberOfBlocks--

        const numberOfBytes = numberOfBlocks * blockSize
        // make sure to create a copy of the output buffer slice as it will get flushed in the next line
        const output = Buffer.from(instance.#outputBuffer.read(0, numberOfBytes))
        instance.#outputBuffer.flushStart(numberOfBytes)

        if (instance.#outBits === 0) {
          // set last byte to 0
          instance.#outputBuffer.dropEnd(1)
          instance.#outputBuffer.append(Buffer.from([0]))
        }

        callback(null, output)
      } catch (e: unknown) {
        callback(e as Error)
      }
    }
  }

  #onInputFinished(callback: TransformCallback) {
    this.#streamEnded = true

    try {
      this.#processChunkData()

      if (this.#verbose) {
        console.log('---------------')
        console.log('implode: total number of chunks read:', this.#stats.chunkCounter)
        console.log('implode: inputBuffer heap size', toHex(this.#inputBuffer.heapSize()))
        console.log('implode: outputBuffer heap size', toHex(this.#outputBuffer.heapSize()))
      }

      callback(null, this.#outputBuffer.read())
    } catch (e: unknown) {
      callback(e as Error)
    }
  }

  #processChunkData() {
    if (this.#dictionarySizeMask === -1) {
      this.#setup()
    }

    if (!this.#inputBuffer.isEmpty()) {
      this.#startIndex = 0

      if (!this.#handledFirstTwoBytes) {
        if (this.#inputBuffer.size() < 3) {
          return
        }

        this.#handledFirstTwoBytes = true

        this.#handleFirstTwoBytes()
      }

      // -------------------------------

      let endOfLastMatch = 0 // used when searching for longer repetitions later

      while (this.#startIndex < this.#inputBuffer.size()) {
        let { size, distance } = findRepetitions(
          this.#inputBuffer.read(endOfLastMatch),
          endOfLastMatch,
          this.#startIndex,
        )

        let isFlushable = this.#isRepetitionFlushable(size, distance)

        if (isFlushable === false) {
          const byte = this.#inputBuffer.readByte(this.#startIndex)
          this.#outputBits(this.#nChBits[byte], this.#nChCodes[byte])
          this.#startIndex += 1
        } else {
          if (isFlushable === null) {
            /*
            // Try to find better repetition 1 byte later.
            // stormlib/implode.c L517
            let cursor = this.#startIndex
            let newSize = size
            let newDistance = distance
            let currentSize
            let currentDistance
            while (newSize <= currentSize && this.#isRepetitionFlushable(newSize, newDistance)) {
              currentSize = newSize
              currentDistance = newDistance
              const reps = findRepetitions(this.#inputBuffer.read(endOfLastMatch), endOfLastMatch, ++cursor)
              newSize = reps.size
              newDistance = reps.distance
            }
            size = newSize
            distance = currentDistance
            */
          }

          const byte = size + 0xfe
          this.#outputBits(this.#nChBits[byte], this.#nChCodes[byte])
          if (size === 2) {
            const byte = distance >> 2
            this.#outputBits(this.#distBits[byte], this.#distCodes[byte])
            this.#outputBits(2, distance & 3)
          } else {
            const byte = distance >> this.#dictionarySize
            this.#outputBits(this.#distBits[byte], this.#distCodes[byte])
            this.#outputBits(this.#dictionarySize, this.#dictionarySizeMask & distance)
          }

          this.#startIndex += size
        }

        /*
        this.#inputBuffer.dropStart(endOfLastMatch)
        this.#startIndex -= endOfLastMatch
        endOfLastMatch = 0
        */

        if (this.#dictionarySize === DictionarySize.Small && this.#startIndex >= 0x400) {
          this.#inputBuffer.dropStart(0x400)
          this.#startIndex -= 0x400
        } else if (this.#dictionarySize === DictionarySize.Medium && this.#startIndex >= 0x800) {
          this.#inputBuffer.dropStart(0x800)
          this.#startIndex -= 0x800
        } else if (this.#dictionarySize === DictionarySize.Large && this.#startIndex >= 0x1000) {
          this.#inputBuffer.dropStart(0x1000)
          this.#startIndex -= 0x1000
        }
      }

      // -------------------------------

      this.#inputBuffer.dropStart(this.#inputBuffer.size())
    }

    if (this.#streamEnded) {
      // Write the termination literal
      this.#outputBits(last(this.#nChBits), last(this.#nChCodes))
    }
  }

  /**
   * @returns false - non flushable
   * @returns true - flushable
   * @returns null - flushable, but there might be a better repetition
   */
  #isRepetitionFlushable(size: number, distance: number) {
    if (size === 0) {
      return false
    }

    // If we found repetition of 2 bytes, that is 0x100 or further back,
    // don't bother. Storing the distance of 0x100 bytes would actually
    // take more space than storing the 2 bytes as-is.
    if (size === 2 && distance >= 0x100) {
      return false
    }

    if (size >= 8 || this.#startIndex + 1 >= this.#inputBuffer.size()) {
      return true
    }

    return null
  }

  /**
   * repetitions are at least 2 bytes long,
   * so the initial 2 bytes can be moved to the output as is
   */
  #handleFirstTwoBytes() {
    const byte1 = this.#inputBuffer.readByte(0)
    const byte2 = this.#inputBuffer.readByte(1)
    this.#outputBits(this.#nChBits[byte1], this.#nChCodes[byte1])
    this.#outputBits(this.#nChBits[byte2], this.#nChCodes[byte2])
    this.#startIndex += 2
  }

  #setup() {
    switch (this.#dictionarySize) {
      case DictionarySize.Large:
        this.#dictionarySizeMask = nBitsOfOnes(6)
        break
      case DictionarySize.Medium:
        this.#dictionarySizeMask = nBitsOfOnes(5)
        break
      case DictionarySize.Small:
        this.#dictionarySizeMask = nBitsOfOnes(4)
        break
    }

    switch (this.#compressionType) {
      case Compression.Binary:
        let nChCode = 0
        for (let nCount = 0; nCount < 0x100; nCount++) {
          this.#nChBits[nCount] = 9
          this.#nChCodes[nCount] = nChCode
          nChCode = getLowestNBits(16, nChCode) + 2
        }
        break
      case Compression.Ascii:
        for (let nCount = 0; nCount < 0x100; nCount++) {
          this.#nChBits[nCount] = ChBitsAsc[nCount] + 1
          this.#nChCodes[nCount] = ChCodeAsc[nCount] * 2
        }
        break
    }

    let nCount = 0x100

    for (let i = 0; i < 0x10; i++) {
      for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
        this.#nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
        this.#nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | (LenCode[i] * 2) | 1
        nCount++
      }
    }

    this.#outputBuffer.append(Buffer.from([this.#compressionType, this.#dictionarySize, 0]))
    this.#outBits = 0
  }

  #outputBits(nBits: number, bitBuffer: number) {
    if (nBits > 8) {
      this.#outputBits(8, bitBuffer)
      bitBuffer = bitBuffer >> 8
      nBits = nBits - 8
    }

    const outBits = this.#outBits

    const lastBytes = this.#outputBuffer.readByte(this.#outputBuffer.size() - 1)
    this.#outputBuffer.dropEnd(1)
    this.#outputBuffer.append(Buffer.from([lastBytes | getLowestNBits(8, bitBuffer << outBits)]))

    this.#outBits = this.#outBits + nBits

    if (this.#outBits > 8) {
      bitBuffer = bitBuffer >> (8 - outBits)
      this.#outputBuffer.append(Buffer.from([getLowestNBits(8, bitBuffer)]))
      this.#outBits = getLowestNBits(3, this.#outBits)
    } else {
      this.#outBits = getLowestNBits(3, this.#outBits)
      if (this.#outBits === 0) {
        this.#outputBuffer.append(Buffer.from([0]))
      }
    }
  }
}
