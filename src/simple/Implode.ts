import {
  COMPRESSION_CODES,
  ChBitsAsc,
  ChCodeAsc,
  DICTIONARY_CODES,
  DistBits,
  DistCode,
  ExLenBits,
  LONGEST_ALLOWED_REPETITION,
  LenBits,
  LenCode,
} from '../constants.ts'
import { clamp, getLowestNBitsOf, repeat, nBitsOfOnes } from '../functions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'

const HEADER_SIZE_IN_BYTES = 3

const TERMINATION_LITERAL_MAX_SIZE_IN_BYTES = 2

/**
 * Lookup table used for finding repetitions easier
 *
 * key = 16 bit combination of 2 uint8 bytes
 * value = latest occurrance within the buffer
 */
let lastOccurrences: Record<number, number>

/**
 * Function assumes a < b - 2
 */
function getSizeOfMatching(view: Uint8Array, a: number, b: number): number {
  const maxLength = clamp(b - a, 2, LONGEST_ALLOWED_REPETITION)

  for (let i = 2; i <= maxLength; i++) {
    if (view[a + i] !== view[b + i]) {
      return i
    }
  }

  return maxLength
}

function readUint16(view: Uint8Array, at: number): number {
  const highByte = view[at]
  const lowByte = view[at + 1]
  return (highByte << 8) | lowByte
}

function findRepetitions(
  view: Uint8Array,
  inputBytesLength: number,
  cursor: number,
): { size: number; distance: number } {
  const notEnoughBytes = cursor + 2 > inputBytesLength
  const tooClose = cursor < 2
  if (notEnoughBytes || tooClose) {
    return { size: 0, distance: 0 }
  }

  const needle = readUint16(view, cursor)
  const matchedAt = lastOccurrences[needle] ?? -1

  lastOccurrences[needle] = cursor

  if (matchedAt === -1) {
    return { size: 0, distance: 0 }
  }

  if (matchedAt === cursor - 2) {
    return { distance: 1, size: 2 }
  }

  return {
    distance: cursor - matchedAt - 1,
    size: getSizeOfMatching(view, matchedAt, cursor),
  }
}

/**
 * Returns a byte view over the input without copying it.
 *
 * A `Buffer` is a `Uint8Array`, so it is a valid input for the codec, but it is not an
 * `ArrayBuffer`. Since `Buffer` became generic (`Buffer<ArrayBuffer>`) it is not assignable to
 * `ArrayBufferLike` anymore, which is why the input is typed as the union of the two here and the
 * view is made in one place: a single `new Uint8Array(input)` can not resolve its overloads for the
 * union, and copying a typed array which is already a byte view would be wasteful.
 *
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/pull/70694
 */
function asByteView(input: ArrayBufferLike | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return input
  }

  return new Uint8Array(input)
}

export class Implode {
  private inputBuffer: ArrayBufferLike | Uint8Array
  /**
   * Used for accessing the data within inputBuffer
   */
  private inputBufferView: Uint8Array
  /**
   * Used for caching inputBuffer.byteLength as that getter is doing some uncached computation to measure the length of
   * inputBuffer
   */
  private inputBufferSize: number
  /**
   * The implode algorithm works by trimming off the beginning of inputBuffer byte by byte. Instead of actually
   * adjusting the inputBuffer every time a byte is handled we store the beginning of the unhandled section and use it
   * when indexing data that is being read.
   */
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

  constructor(input: ArrayBufferLike | Uint8Array, compressionType: CompressionType, dictionarySize: DictionarySize) {
    this.dictionarySizeMask = 0
    this.distCodes = structuredClone(DistCode)
    this.distBits = structuredClone(DistBits)
    this.outBits = 0
    this.nChBits = repeat(0, 0x3_06)
    this.nChCodes = repeat(0, 0x3_06)

    this.setupTables(compressionType, dictionarySize)

    this.inputBuffer = input
    this.inputBufferView = asByteView(this.inputBuffer)
    this.inputBufferSize = this.inputBuffer.byteLength
    this.inputBufferStartIndex = 0

    this.outputBuffer = new ArrayBuffer(
      this.inputBufferSize + HEADER_SIZE_IN_BYTES + TERMINATION_LITERAL_MAX_SIZE_IN_BYTES,
    )
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
    this.outputBufferView[0] = COMPRESSION_CODES[compressionType]
    this.outputBufferView[1] = DICTIONARY_CODES[dictionarySize]

    this.outputBufferView[2] = 0
    this.outputBufferSize = 3
  }

  private processInput(dictionarySize: DictionarySize): void {
    lastOccurrences = {}

    if (this.inputBufferSize === 0) {
      return
    }

    if (this.inputBufferSize <= 2) {
      this.skipFirstTwoBytes()
      return
    }

    this.skipFirstTwoBytes()

    while (this.inputBufferSize > this.inputBufferStartIndex) {
      const { size, distance } = findRepetitions(this.inputBufferView, this.inputBufferSize, this.inputBufferStartIndex)

      const isFlushable = this.isRepetitionFlushable(size, distance)

      if (isFlushable === false) {
        const byte = this.inputBufferView[this.inputBufferStartIndex]
        this.outputBits(this.nChBits[byte], this.nChCodes[byte])
        this.inputBufferStartIndex = this.inputBufferStartIndex + 1
      } else {
        // TODO: the `byte` variables below shadow this one, they should have their own names when
        // this method is touched (the @typescript-eslint/no-shadow rule is off for now)
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

      let blockSizeInBytes: number
      switch (dictionarySize) {
        case 'small': {
          blockSizeInBytes = 0x4_00
          break
        }

        case 'medium': {
          blockSizeInBytes = 0x8_00
          break
        }

        case 'large': {
          blockSizeInBytes = 0x10_00
          break
        }
      }

      if (this.inputBufferStartIndex >= blockSizeInBytes) {
        this.inputBuffer = this.inputBuffer.slice(blockSizeInBytes)
        this.inputBufferView = asByteView(this.inputBuffer)
        this.inputBufferSize = this.inputBufferSize - blockSizeInBytes
        this.inputBufferStartIndex = this.inputBufferStartIndex - blockSizeInBytes
        lastOccurrences = {}
      }
    }
  }

  private writeTerminationLiteral(): void {
    this.outputBits(this.nChBits.at(-1) as number, this.nChCodes.at(-1) as number)
  }

  /**
   * Tells whether the repetition can be flushed at the current position
   *
   * @returns false when it is not flushable, true when it is, and null when it is flushable but a
   * better repetition might be found
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

    if (size >= 8 || this.inputBufferSize - this.inputBufferStartIndex < 2) {
      return true
    }

    return null
  }

  /**
   * Repetitions are at least 2 bytes long,
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
