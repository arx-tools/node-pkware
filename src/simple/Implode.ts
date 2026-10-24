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
} from '../constants.ts'
import { getLowestNBitsOf, nBitsOfOnes, repeat } from '../functions.ts'
import { asByteView } from '../common/byteView.ts'
import { findRepetitions } from '../common/matchFinder.ts'
import { GrowingOutputBuffer } from '../common/outputBuffer.ts'
import { outputBits } from '../common/outputBits.ts'
import { isRepetitionFlushable } from '../common/repetitions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'

const HEADER_SIZE_IN_BYTES = 3

const TERMINATION_LITERAL_MAX_SIZE_IN_BYTES = 2

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
  outputBuffer: GrowingOutputBuffer
  /**
   * The number of the bits in the last, not yet complete byte of the output.
   */
  outBits: number

  private inputBuffer: ArrayBufferLike | Uint8Array
  /**
   * Used for accessing the data within inputBuffer.
   */
  private inputBufferView: Uint8Array
  /**
   * Used for caching inputBuffer.byteLength as that getter is doing some uncached computation to measure the length of
   * inputBuffer.
   */
  private inputBufferSize: number
  /**
   * The implode algorithm works by trimming off the beginning of inputBuffer byte by byte. Instead of actually
   * adjusting the inputBuffer every time a byte is handled we store the beginning of the unhandled section and use it
   * when indexing data that is being read.
   */
  private inputBufferStartIndex: number

  private dictionarySizeMask: number
  private readonly distCodes: number[]
  private readonly distBits: number[]
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

    this.outputBuffer = new GrowingOutputBuffer(
      this.inputBufferSize + HEADER_SIZE_IN_BYTES + TERMINATION_LITERAL_MAX_SIZE_IN_BYTES,
    )

    this.outputHeader(compressionType, dictionarySize)
    this.processInput(dictionarySize)

    this.writeTerminationLiteral()
  }

  public getResult(): ArrayBuffer {
    return this.outputBuffer.getWrittenBytes().buffer as ArrayBuffer
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
    this.outputBuffer.appendByte(COMPRESSION_CODES[compressionType])
    this.outputBuffer.appendByte(DICTIONARY_CODES[dictionarySize])
    this.outputBuffer.appendByte(0)
  }

  private processInput(dictionarySize: DictionarySize): void {
    this.lastOccurrences = {}

    if (this.inputBufferSize === 0) {
      return
    }

    if (this.inputBufferSize <= 2) {
      this.skipFirstTwoBytes()
      return
    }

    this.skipFirstTwoBytes()

    while (this.inputBufferSize > this.inputBufferStartIndex) {
      const { size, distance } = findRepetitions(this, this.inputBufferView, this.inputBufferStartIndex)

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
        this.lastOccurrences = {}
      }
    }
  }

  private writeTerminationLiteral(): void {
    this.outputBits(this.nChBits.at(-1) as number, this.nChCodes.at(-1) as number)
  }

  /**
   * Tells whether the repetition can be flushed at the current position.
   *
   * @returns False when it is not flushable, true when it is, and null when it is flushable but a
   * better repetition might be found.
   */
  private isRepetitionFlushable(size: number, distance: number): boolean | null {
    return isRepetitionFlushable(size, distance, this.inputBufferSize - this.inputBufferStartIndex)
  }

  /**
   * Repetitions are at least 2 bytes long,
   * so the initial 2 bytes can be moved to the output as is.
   */
  private skipFirstTwoBytes(): void {
    const availableBytes = Math.min(2, this.inputBufferSize - this.inputBufferStartIndex)

    for (let index = 0; index < availableBytes; index++) {
      const byte = this.inputBufferView[this.inputBufferStartIndex + index]

      this.outputBits(this.nChBits[byte], this.nChCodes[byte])
    }

    this.inputBufferStartIndex = this.inputBufferStartIndex + availableBytes
  }

  private outputBits(numberOfBits: number, bitBuffer: number): void {
    outputBits(this, numberOfBits, bitBuffer)
  }
}
