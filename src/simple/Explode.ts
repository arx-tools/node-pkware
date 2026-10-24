import { generateAsciiTables, generateDecodeTables } from '../common/decodeTables.ts'
import { decodeDistance, decodeNextLiteral, parseHeader, wasteBits } from '../common/explode.ts'
import { FixedInputBuffer } from '../common/inputBuffer.ts'
import { DistBits, DistCode, EMPTY_BUFFER, LITERAL_END_STREAM, LenBits, LenCode } from '../constants.ts'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from '../errors.ts'
import { concatArrayBuffersAndLengthedDatas, repeat, sliceArrayBufferAt, uint8ArrayToArray } from '../functions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'

export class Explode {
  /**
   * The compressed data, the shared decoder reads it through the `InputBuffer` interface.
   */
  inputBuffer: FixedInputBuffer
  /**
   * The number of the bits that are buffered but not consumed yet.
   */
  extraBits: number
  /**
   * The buffered bits, the shared decoder consumes them from the lower bits.
   */
  bitBuffer: number
  /**
   * The compression type of the stream, it selects the literal decoder of the shared decoder.
   */
  compressionType: CompressionType | 'unknown'
  /**
   * The number of the bits that describe the distance of a repetition.
   */
  dictionarySizeBits: number
  /**
   * The mask of the bits that describe the distance of a repetition.
   */
  dictionarySizeMask: number
  readonly lengthCodes: number[]
  readonly distPosCodes: number[]
  /**
   * The dictionary size of the stream, it comes from the header.
   */
  dictionarySize: DictionarySize | 'unknown'
  chBitsAsc: number[] = []
  /**
   * The naming comes from stormlib, the 2C34 refers to the table's position in memory.
   */
  asciiTable2C34: number[] = []
  /**
   * The naming comes from stormlib, the 2D34 refers to the table's position in memory.
   */
  asciiTable2D34: number[] = []
  /**
   * The naming comes from stormlib, the 2E34 refers to the table's position in memory.
   */
  asciiTable2E34: number[] = []
  /**
   * The naming comes from stormlib, the 2EB4 refers to the table's position in memory.
   */
  asciiTable2EB4: number[] = []

  private outputBuffer: ArrayBuffer
  private outputBufferView: Uint8Array
  private outputBufferSize: number
  private needMoreInput: boolean

  constructor(input: ArrayBufferLike | Uint8Array) {
    this.needMoreInput = true
    this.extraBits = 0
    this.bitBuffer = 0
    this.lengthCodes = generateDecodeTables(LenCode, LenBits)
    this.distPosCodes = generateDecodeTables(DistCode, DistBits)

    this.inputBuffer = new FixedInputBuffer(input)

    this.outputBuffer = EMPTY_BUFFER
    this.outputBufferView = new Uint8Array(this.outputBuffer)
    this.outputBufferSize = 0

    this.compressionType = 'unknown'
    this.dictionarySize = 'unknown'
    this.dictionarySizeMask = 0
    this.dictionarySizeBits = 0
    this.setupAsciiTables()

    this.processInput()

    if (this.needMoreInput) {
      throw new AbortedError()
    }
  }

  getResult(): ArrayBuffer {
    return this.outputBuffer.slice(0, this.outputBufferSize)
  }

  /**
   * Generates the ascii tables from the constants.
   */
  private setupAsciiTables(): void {
    const tables = generateAsciiTables()

    this.chBitsAsc = tables.chBitsAsc
    this.asciiTable2C34 = tables.asciiTable2C34
    this.asciiTable2D34 = tables.asciiTable2D34
    this.asciiTable2E34 = tables.asciiTable2E34
    this.asciiTable2EB4 = tables.asciiTable2EB4
  }

  /**
   * Skips the given number of bits of the input.
   *
   * @throws `AbortedError` when there isn't enough data to be wasted.
   */
  private wasteBits(numberOfBits: number): void {
    wasteBits(this, numberOfBits)
  }

  /**
   * Decodes the next literal from the input.
   *
   * @throws `AbortedError`.
   */
  private decodeNextLiteral(): number {
    return decodeNextLiteral(this)
  }

  /**
   * Decodes the distance of a repetition.
   *
   * @throws `AbortedError`.
   */
  private decodeDistance(repeatLength: number): number {
    return decodeDistance(this, repeatLength)
  }

  /**
   * Decompresses the whole input buffer.
   *
   * @throws `InvalidCompressionTypeError` when the compression type is not a known value.
   * @throws `InvalidDictionarySizeError` when the dictionary size is not a known value.
   * @throws `AbortedError` when the input is malformed.
   */
  private processInput(): void {
    const headerParsedSuccessfully = this.parseInitialData()
    if (!headerParsedSuccessfully || this.inputBuffer.isEmpty()) {
      return
    }

    this.needMoreInput = false

    const additions: Array<ArrayBufferLike | { data: number[]; byteLength: number }> = []
    let additionsByteSum = 0
    const finalizedChunks: ArrayBufferLike[] = []
    const blockSizeInBytes = 0x10_00

    try {
      let nextLiteral = this.decodeNextLiteral()

      while (nextLiteral !== LITERAL_END_STREAM) {
        // we have a character literal here
        if (nextLiteral < 0x1_00) {
          additions.push({ data: [nextLiteral], byteLength: 1 })
          additionsByteSum = additionsByteSum + 1
          nextLiteral = this.decodeNextLiteral()
          continue
        }

        // we have some bytes to copy from earlier bytes, which is referred to as the "repetition":
        // nextLiteral holds information on both how far back the start of the repetition is
        // and the info on how long the repetition is

        const repeatLength = nextLiteral - 0xfe
        const minusDistance = this.decodeDistance(repeatLength)

        // dump the beginning of the output buffer if outputBuffer and the additions exceed 2 blocks
        if (this.outputBufferSize + additionsByteSum > blockSizeInBytes * 2) {
          this.outputBufferSize = this.outputBufferSize + additionsByteSum
          this.outputBuffer = concatArrayBuffersAndLengthedDatas(
            [this.outputBuffer, ...additions],
            this.outputBufferSize,
          )
          this.outputBufferView = new Uint8Array(this.outputBuffer)
          additions.length = 0
          additionsByteSum = 0

          const [a, b] = sliceArrayBufferAt(this.outputBuffer, blockSizeInBytes)
          finalizedChunks.push(a)
          this.outputBuffer = b
          this.outputBufferView = new Uint8Array(this.outputBuffer)
          this.outputBufferSize = this.outputBufferSize - blockSizeInBytes
        }

        const start = this.outputBufferSize + additionsByteSum - minusDistance

        // only add the additions if the "repetition" bleeds into the bytes of "additions"
        if (this.outputBufferSize < start + repeatLength) {
          this.outputBufferSize = this.outputBufferSize + additionsByteSum
          this.outputBuffer = concatArrayBuffersAndLengthedDatas(
            [this.outputBuffer, ...additions],
            this.outputBufferSize,
          )
          this.outputBufferView = new Uint8Array(this.outputBuffer)
          additions.length = 0
          additionsByteSum = 0
        }

        const availableDataLength = Math.min(start + repeatLength, this.outputBufferSize) - start

        const availableData: { data: number[]; byteLength: number } = {
          data: uint8ArrayToArray(this.outputBufferView, start, availableDataLength),
          byteLength: availableDataLength,
        }

        if (repeatLength > minusDistance) {
          const repeats = Math.ceil(repeatLength / availableData.byteLength)
          const multipliedData = repeat(availableData, repeats)

          const addition = concatArrayBuffersAndLengthedDatas(multipliedData, repeatLength * repeats).slice(
            0,
            repeatLength,
          )

          additions.push(addition)
          additionsByteSum = additionsByteSum + repeatLength
        } else {
          additions.push(availableData)
          additionsByteSum = additionsByteSum + availableData.byteLength
        }

        nextLiteral = this.decodeNextLiteral()
      }
    } catch {
      this.needMoreInput = true
    }

    const finalizedChunksSize = finalizedChunks.length * blockSizeInBytes
    this.outputBufferSize = finalizedChunksSize + this.outputBufferSize + additionsByteSum
    this.outputBuffer = concatArrayBuffersAndLengthedDatas(
      [...finalizedChunks, this.outputBuffer, ...additions],
      this.outputBufferSize,
    )
    this.outputBufferView = new Uint8Array(this.outputBuffer)
  }

  /**
   * Parses the header and the first bit of the input.
   *
   * @returns True when the header is parsed, false when there is not enough data yet.
   * @throws `InvalidCompressionTypeError` when the compression type is not a known value.
   * @throws `InvalidDictionarySizeError` when the dictionary size is not a known value.
   */
  private parseInitialData(): boolean {
    if (!parseHeader(this)) {
      return false
    }

    if (this.compressionType === 'ascii') {
      this.setupAsciiTables()
    }

    return true
  }
}
