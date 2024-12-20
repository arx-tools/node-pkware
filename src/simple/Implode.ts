import { Buffer } from 'node:buffer'
import {
  ChBitsAsc,
  ChCodeAsc,
  DistBits,
  DistCode,
  ExLenBits,
  LenBits,
  LenCode,
  LONGEST_ALLOWED_REPETITION,
} from '@src/constants.js'
import { ExpandingBuffer } from '@src/ExpandingBuffer.js'
import { clamp, quotientAndRemainder, getLowestNBitsOf, repeat, nBitsOfOnes } from '@src/functions.js'

function getSizeOfMatching(inputBytes: Buffer, a: number, b: number): number {
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
  private readonly inputBuffer: ExpandingBuffer
  private readonly outputBuffer: ExpandingBuffer
  private readonly compressionType: 'ascii' | 'binary'
  private readonly dictionarySize: 'small' | 'medium' | 'large'
  private dictionarySizeMask: number
  private streamEnded: boolean
  private readonly distCodes: number[]
  private readonly distBits: number[]
  private startIndex: number
  private handledFirstTwoBytes: boolean
  private outBits: number
  private nChBits: number[]
  private nChCodes: number[]

  constructor(compressionType: 'ascii' | 'binary', dictionarySize: 'small' | 'medium' | 'large') {
    this.inputBuffer = new ExpandingBuffer(0x1_00_00)
    this.outputBuffer = new ExpandingBuffer(0x1_20_00)
    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.dictionarySizeMask = 0
    this.streamEnded = false
    this.distCodes = structuredClone(DistCode)
    this.distBits = structuredClone(DistBits)
    this.startIndex = 0
    this.handledFirstTwoBytes = false
    this.outBits = 0
    this.nChBits = repeat(0, 0x3_06)
    this.nChCodes = repeat(0, 0x3_06)

    this.setup()
  }

  handleData(input: Buffer): Buffer {
    this.inputBuffer.append(input)

    this.processChunkData()

    const blockSize = 0x8_00

    let output: Buffer

    if (this.outputBuffer.size() > blockSize) {
      let [numberOfBlocks] = quotientAndRemainder(this.outputBuffer.size(), blockSize)

      // making sure to leave one block worth of data for lookback when processing chunk data
      numberOfBlocks = numberOfBlocks - 1

      const numberOfBytes = numberOfBlocks * blockSize
      // make sure to create a copy of the output buffer slice as it will get flushed in the next line
      output = Buffer.from(this.outputBuffer.read(0, numberOfBytes))
      this.outputBuffer.flushStart(numberOfBytes)

      if (this.outBits === 0) {
        this.outputBuffer.setByte(-1, 0)
      }
    } else {
      output = Buffer.from([])
    }

    // ---------------

    this.streamEnded = true
    this.processChunkData()
    const remainingOutput = this.outputBuffer.read()

    return Buffer.concat([output, remainingOutput])
  }

  private processChunkData(): void {
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

      const endOfLastMatch = 0 // used when searching for longer repetitions later

      while (this.startIndex < this.inputBuffer.size()) {
        const { size, distance } = findRepetitions(
          this.inputBuffer.read(endOfLastMatch),
          endOfLastMatch,
          this.startIndex,
        )

        const isFlushable = this.isRepetitionFlushable(size, distance)

        if (isFlushable === false) {
          const byte = this.inputBuffer.readByte(this.startIndex)
          this.outputBits(this.nChBits[byte], this.nChCodes[byte])
          this.startIndex = this.startIndex + 1
        } else {
          const byte = size + 0xfe
          this.outputBits(this.nChBits[byte], this.nChCodes[byte])
          if (size === 2) {
            const byte = distance >> 2
            this.outputBits(this.distBits[byte], this.distCodes[byte])
            this.outputBits(2, distance & 3)
          } else {
            switch (this.dictionarySize) {
              case 'small': {
                const byte = distance >> 4
                this.outputBits(this.distBits[byte], this.distCodes[byte])
                this.outputBits(4, this.dictionarySizeMask & distance)
                break
              }

              case 'medium': {
                const byte = distance >> 5
                this.outputBits(this.distBits[byte], this.distCodes[byte])
                this.outputBits(5, this.dictionarySizeMask & distance)
                break
              }

              case 'large': {
                const byte = distance >> 6
                this.outputBits(this.distBits[byte], this.distCodes[byte])
                this.outputBits(6, this.dictionarySizeMask & distance)
                break
              }
            }
          }

          this.startIndex = this.startIndex + size
        }

        if (this.dictionarySize === 'small' && this.startIndex >= 0x4_00) {
          this.inputBuffer.dropStart(0x4_00)
          this.startIndex = this.startIndex - 0x4_00
        } else if (this.dictionarySize === 'medium' && this.startIndex >= 0x8_00) {
          this.inputBuffer.dropStart(0x8_00)
          this.startIndex = this.startIndex - 0x8_00
        } else if (this.dictionarySize === 'large' && this.startIndex >= 0x10_00) {
          this.inputBuffer.dropStart(0x10_00)
          this.startIndex = this.startIndex - 0x10_00
        }
      }

      // -------------------------------

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
      case 'ascii': {
        for (let nCount = 0; nCount < 0x1_00; nCount++) {
          this.nChBits[nCount] = ChBitsAsc[nCount] + 1
          this.nChCodes[nCount] = ChCodeAsc[nCount] * 2
        }

        this.outputBuffer.appendByte(1)

        break
      }

      case 'binary': {
        let nChCode = 0
        for (let nCount = 0; nCount < 0x1_00; nCount++) {
          this.nChBits[nCount] = 9
          this.nChCodes[nCount] = nChCode
          nChCode = getLowestNBitsOf(nChCode, 16) + 2
        }

        this.outputBuffer.appendByte(0)

        break
      }
    }

    switch (this.dictionarySize) {
      case 'small': {
        this.dictionarySizeMask = nBitsOfOnes(4)
        this.outputBuffer.appendByte(4)
        break
      }

      case 'medium': {
        this.dictionarySizeMask = nBitsOfOnes(5)
        this.outputBuffer.appendByte(5)
        break
      }

      case 'large': {
        this.dictionarySizeMask = nBitsOfOnes(6)
        this.outputBuffer.appendByte(6)
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
