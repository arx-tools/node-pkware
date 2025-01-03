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
import { clamp, getLowestNBitsOf, repeat, nBitsOfOnes } from '@src/functions.js'
import { type CompressionType, type DictionarySize } from '@src/simple/types.js'

/**
 * in bytes
 */
const SIZE_OF_HEADER = 3

/**
 * in bytes
 */
const MAX_SIZE_OF_TERMINATION_LITERAL = 2

function getSizeOfMatching(inputBytes: ArrayBufferLike, a: number, b: number): number {
  const limit = clamp(2, LONGEST_ALLOWED_REPETITION, b - a)

  const view = new Uint8Array(inputBytes)

  for (let i = 2; i <= limit; i++) {
    if (view[a + i] !== view[b + i]) {
      return i
    }
  }

  return limit
}

function matchesAt(needle: ArrayBufferLike, haystack: ArrayBufferLike): number {
  if (needle.byteLength === 0 || haystack.byteLength === 0) {
    return -1
  }

  const needleView = new Uint8Array(needle)
  const haystackView = new Uint8Array(haystack)

  for (let i = 0; i < haystack.byteLength - needle.byteLength; i++) {
    let matches = true
    for (let j = 0; j < needle.byteLength; j++) {
      if (haystackView[i + j] !== needleView[j]) {
        matches = false
        break
      }
    }

    if (matches) {
      return i
    }
  }

  return -1
}

/**
 * TODO: make sure that we find the most recent one,
 * which in turn allows us to store backward length in less amount of bits
 * currently the code goes from the furthest point
 */
function findRepetitions(
  inputBytes: ArrayBufferLike,
  endOfLastMatch: number,
  cursor: number,
): { size: number; distance: number } {
  const notEnoughBytes = inputBytes.byteLength - cursor < 2
  const tooClose = cursor === endOfLastMatch || cursor - endOfLastMatch < 2
  if (notEnoughBytes || tooClose) {
    return { size: 0, distance: 0 }
  }

  const haystack = inputBytes.slice(endOfLastMatch, cursor)
  const needle = inputBytes.slice(cursor, cursor + 2)

  const matchIndex = matchesAt(needle, haystack)
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
  private inputBuffer: ArrayBufferLike
  private inputBufferView: Uint8Array
  private inputBufferStartIndex: number

  private readonly outputBuffer: ArrayBuffer
  private outputBufferView: Uint8Array
  private outputBufferSize: number

  private dictionarySizeMask: number
  private readonly distCodes: number[]
  private readonly distBits: number[]
  private outBits: number
  private readonly nChBits: number[]
  private readonly nChCodes: number[]

  constructor(input: ArrayBufferLike, compressionType: CompressionType, dictionarySize: DictionarySize) {
    this.dictionarySizeMask = 0
    this.distCodes = structuredClone(DistCode)
    this.distBits = structuredClone(DistBits)
    this.outBits = 0
    this.nChBits = repeat(0, 0x3_06)
    this.nChCodes = repeat(0, 0x3_06)

    this.setupTables(compressionType, dictionarySize)

    this.inputBuffer = input
    this.inputBufferView = new Uint8Array(this.inputBuffer)
    this.inputBufferStartIndex = 0

    this.outputBuffer = new ArrayBuffer(input.byteLength + SIZE_OF_HEADER + MAX_SIZE_OF_TERMINATION_LITERAL)
    this.outputBufferView = new Uint8Array(this.outputBuffer)
    this.outputBufferSize = 0

    this.outputHeader(compressionType, dictionarySize)
    this.processInput(dictionarySize)

    this.writeTerminationLiteral()
  }

  public getResult(): ArrayBuffer {
    return this.outputBuffer.slice(0, this.outputBufferSize)
  }

  private setupTables(compressionType: CompressionType, dictionarySize: DictionarySize): void {
    switch (compressionType) {
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

    switch (dictionarySize) {
      case 'small': {
        this.dictionarySizeMask = nBitsOfOnes(4)
        break
      }

      case 'medium': {
        this.dictionarySizeMask = nBitsOfOnes(5)
        break
      }

      case 'large': {
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
  }

  private outputHeader(compressionType: CompressionType, dictionarySize: DictionarySize): void {
    switch (compressionType) {
      case 'ascii': {
        this.outputBufferView[0] = 1
        break
      }

      case 'binary': {
        this.outputBufferView[0] = 0
        break
      }
    }

    switch (dictionarySize) {
      case 'small': {
        this.outputBufferView[1] = 4
        break
      }

      case 'medium': {
        this.outputBufferView[1] = 5
        break
      }

      case 'large': {
        this.outputBufferView[1] = 6
        break
      }
    }

    this.outputBufferView[2] = 0
    this.outputBufferSize = 3
  }

  private processInput(dictionarySize: DictionarySize): void {
    if (this.inputBuffer.byteLength === 0) {
      return
    }

    if (this.inputBuffer.byteLength <= 2) {
      this.skipFirstTwoBytes()
      return
    }

    this.skipFirstTwoBytes()

    // -------------------------------
    // work in progress

    const endOfLastMatch = 0 // used when searching for longer repetitions later

    while (this.inputBuffer.byteLength - this.inputBufferStartIndex > 0) {
      let data: { size: number; distance: number }
      if (endOfLastMatch > 0) {
        data = findRepetitions(this.inputBuffer.slice(endOfLastMatch), endOfLastMatch, this.inputBufferStartIndex)
      } else {
        data = findRepetitions(this.inputBuffer, endOfLastMatch, this.inputBufferStartIndex)
      }

      const { size, distance } = data
      const isFlushable = this.isRepetitionFlushable(size, distance)

      if (isFlushable === false) {
        const byte = this.inputBufferView[this.inputBufferStartIndex]
        this.outputBits(this.nChBits[byte], this.nChCodes[byte])
        this.inputBufferStartIndex = this.inputBufferStartIndex + 1
      } else {
        const byte = size + 0xfe
        this.outputBits(this.nChBits[byte], this.nChCodes[byte])
        if (size === 2) {
          const byte = distance >> 2
          this.outputBits(this.distBits[byte], this.distCodes[byte])
          this.outputBits(2, distance & 3)
        } else {
          switch (dictionarySize) {
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

        this.inputBufferStartIndex = this.inputBufferStartIndex + size
      }

      let blockSize: number
      switch (dictionarySize) {
        case 'small': {
          blockSize = 0x4_00
          break
        }

        case 'medium': {
          blockSize = 0x8_00
          break
        }

        case 'large': {
          blockSize = 0x10_00
          break
        }
      }

      if (this.inputBufferStartIndex >= blockSize) {
        this.inputBuffer = this.inputBuffer.slice(blockSize)
        this.inputBufferView = new Uint8Array(this.inputBuffer)
        this.inputBufferStartIndex = this.inputBufferStartIndex - blockSize
      }
    }
  }

  private writeTerminationLiteral(): void {
    this.outputBits(this.nChBits.at(-1) as number, this.nChCodes.at(-1) as number)
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

    if (size >= 8 || this.inputBuffer.byteLength - this.inputBufferStartIndex < 2) {
      return true
    }

    return null
  }

  /**
   * repetitions are at least 2 bytes long,
   * so the initial 2 bytes can be moved to the output as is
   */
  private skipFirstTwoBytes(): void {
    const [byte1, byte2] = this.inputBufferView
    this.outputBits(this.nChBits[byte1], this.nChCodes[byte1])
    this.outputBits(this.nChBits[byte2], this.nChCodes[byte2])
    this.inputBufferStartIndex = this.inputBufferStartIndex + 2
  }

  private outputBits(numberOfBits: number, bitBuffer: number): void {
    if (numberOfBits > 8) {
      this.outputBits(8, bitBuffer)
      bitBuffer = bitBuffer >> 8
      numberOfBits = numberOfBits - 8
    }

    const oldOutBits = this.outBits

    this.outputBufferView[this.outputBufferSize - 1] =
      this.outputBufferView[this.outputBufferSize - 1] | getLowestNBitsOf(bitBuffer << oldOutBits, 8)

    this.outBits = this.outBits + numberOfBits

    if (this.outBits > 8) {
      this.outBits = getLowestNBitsOf(this.outBits, 3)
      bitBuffer = bitBuffer >> (8 - oldOutBits)

      this.outputBufferView[this.outputBufferSize] = getLowestNBitsOf(bitBuffer, 8)
      this.outputBufferSize = this.outputBufferSize + 1
    } else {
      this.outBits = getLowestNBitsOf(this.outBits, 3)
      if (this.outBits === 0) {
        this.outputBufferView[this.outputBufferSize] = 0
        this.outputBufferSize = this.outputBufferSize + 1
      }
    }
  }
}
