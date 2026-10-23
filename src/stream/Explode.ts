import { Buffer } from 'node:buffer'
import type { Transform, TransformCallback } from 'node:stream'
import { generateAsciiTables, generateDecodeTables } from '../common/decodeTables.ts'
import { decodeDistance, decodeNextLiteral, parseHeader, wasteBits } from '../common/explode.ts'
import { DistBits, DistCode, LITERAL_END_STREAM, LenBits, LenCode } from '../constants.ts'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from '../errors.ts'
import { quotientAndRemainder, repeat, toHex } from '../functions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'
import { ExpandingBuffer } from './ExpandingBuffer.ts'
import type { Config, Stats } from './types.ts'

const BLOCK_SIZE_IN_BYTES = 0x10_00

/**
 * Reads the compression type and the dictionary size from the first two bytes.
 *
 * This function assumes there are at least 2 bytes of data in the buffer.
 *
 * @throws `InvalidCompressionTypeError` when the compression type is not a known value.
 * @throws `InvalidDictionarySizeError` when the dictionary size is not a known value.
 */
export class Explode {
  /**
   * The compressed data, the shared decoder reads it through the `InputBuffer` interface.
   */
  readonly inputBuffer: ExpandingBuffer
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

  private readonly verbose: boolean
  private needMoreInput: boolean
  private isFirstChunk: boolean
  private readonly backupData: { extraBits: number; bitBuffer: number }
  private readonly outputBuffer: ExpandingBuffer
  private readonly stats: Stats

  constructor(config: Config = {}) {
    this.verbose = config?.verbose ?? false
    this.needMoreInput = true
    this.isFirstChunk = true
    this.extraBits = 0
    this.bitBuffer = 0
    this.backupData = { extraBits: -1, bitBuffer: -1 }
    this.lengthCodes = generateDecodeTables(LenCode, LenBits)
    this.distPosCodes = generateDecodeTables(DistCode, DistBits)
    this.inputBuffer = new ExpandingBuffer(0x1_00_00)
    this.outputBuffer = new ExpandingBuffer(0x4_00_00)
    this.stats = { chunkCounter: 0 }
    this.compressionType = 'unknown'
    this.dictionarySize = 'unknown'
    this.dictionarySizeMask = 0
    this.dictionarySizeBits = 0
    this.setupAsciiTables()
  }

  getHandler() {
    // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias -- the stream handler needs both values: this is the Transform, the alias is the decoder instance
    const instance = this

    return function (
      this: Transform,
      chunk: Buffer,
      encoding: NodeJS.BufferEncoding,
      callback: TransformCallback,
    ): void {
      instance.needMoreInput = true

      try {
        instance.inputBuffer.append(chunk)

        if (instance.isFirstChunk) {
          instance.isFirstChunk = false
          this._flush = instance.onInputFinished.bind(instance)
        }

        if (instance.verbose) {
          instance.stats.chunkCounter = instance.stats.chunkCounter + 1
          console.log(`explode: reading ${toHex(chunk.length)} bytes from chunk #${instance.stats.chunkCounter}`)
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

        callback(null, output)
      } catch (error: unknown) {
        callback(error as Error)
      }
    }
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

  private onInputFinished(callback: TransformCallback): void {
    if (this.verbose) {
      console.log('---------------')
      console.log('explode: total number of chunks read:', this.stats.chunkCounter)
      console.log('explode: inputBuffer heap size', toHex(this.inputBuffer.heapSize()))
      console.log('explode: outputBuffer heap size', toHex(this.outputBuffer.heapSize()))
    }

    if (this.needMoreInput) {
      callback(new AbortedError())
      return
    }

    callback(null, this.outputBuffer.read())
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
   * Processes the buffered input.
   *
   * @throws `InvalidCompressionTypeError` when the compression type is not a known value.
   * @throws `InvalidDictionarySizeError` when the dictionary size is not a known value.
   * @throws `AbortedError` when the input is malformed.
   */
  private processChunkData(): void {
    if (this.inputBuffer.isEmpty()) {
      return
    }

    if (this.compressionType === 'unknown') {
      const headerParsedSuccessfully = this.parseInitialData()
      if (!headerParsedSuccessfully || this.inputBuffer.isEmpty()) {
        return
      }
    }

    this.needMoreInput = false

    this.backup()

    try {
      let nextLiteral = this.decodeNextLiteral()

      while (nextLiteral !== LITERAL_END_STREAM) {
        if (nextLiteral >= 0x1_00) {
          const repeatLength = nextLiteral - 0xfe

          const minusDistance = this.decodeDistance(repeatLength)
          const availableData = this.outputBuffer.read(this.outputBuffer.size() - minusDistance, repeatLength)

          let addition: Buffer

          if (repeatLength > minusDistance) {
            const multipliedData = repeat(availableData, Math.ceil(repeatLength / availableData.length))
            addition = Buffer.concat(multipliedData).subarray(0, repeatLength)
          } else {
            addition = availableData
          }

          this.outputBuffer.append(addition)
        } else {
          this.outputBuffer.appendByte(nextLiteral)
        }

        this.backup()

        nextLiteral = this.decodeNextLiteral()
      }
    } catch {
      this.needMoreInput = true
    }

    if (this.needMoreInput) {
      this.restore()
    }
  }

  /**
   * Parses the header and the first bit of the buffered input.
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

    if (this.verbose) {
      console.log(`explode: compression type: ${this.compressionType}`)
      console.log(`explode: compression level: ${this.dictionarySize}`)
    }

    return true
  }

  private backup(): void {
    this.backupData.extraBits = this.extraBits
    this.backupData.bitBuffer = this.bitBuffer
    this.inputBuffer.saveIndices()
  }

  private restore(): void {
    this.extraBits = this.backupData.extraBits
    this.bitBuffer = this.backupData.bitBuffer
    this.inputBuffer.restoreIndices()
  }
}
