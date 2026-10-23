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
  LITERAL_END_STREAM,
  LenBase,
  LenBits,
  LenCode,
} from '../constants.ts'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from '../errors.ts'
import {
  quotientAndRemainder,
  getLowestNBitsOf,
  mergeSparseArrays,
  nBitsOfOnes,
  repeat,
  toHex,
  unfold,
} from '../functions.ts'
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
/**
 * Reads the compression type from a raw header byte.
 *
 * @throws `InvalidCompressionTypeError` when the byte is not a known code.
 */
function readCompressionType(code: number): CompressionType {
  switch (code) {
    case COMPRESSION_CODES.binary: {
      return 'binary'
    }

    case COMPRESSION_CODES.ascii: {
      return 'ascii'
    }

    default: {
      throw new InvalidCompressionTypeError()
    }
  }
}

/**
 * Reads the dictionary size from a raw header byte.
 *
 * @throws `InvalidDictionarySizeError` when the byte is not a known code.
 */
function readDictionarySize(code: number): DictionarySize {
  switch (code) {
    case DICTIONARY_CODES.small: {
      return 'small'
    }

    case DICTIONARY_CODES.medium: {
      return 'medium'
    }

    case DICTIONARY_CODES.large: {
      return 'large'
    }

    default: {
      throw new InvalidDictionarySizeError()
    }
  }
}

function readHeader(buffer: Buffer): { compressionType: CompressionType; dictionarySize: DictionarySize } {
  const compressionType = readCompressionType(buffer.readUint8(0))
  const dictionarySize = readDictionarySize(buffer.readUint8(1))

  return { compressionType, dictionarySize }
}

function generateDecodeTables(startIndexes: number[], lengthBits: number[]): number[] {
  const codes = repeat(0, 0x1_00)

  for (const [i, lengthBit] of lengthBits.entries()) {
    for (let index = startIndexes[i]; index < 0x1_00; index = index + (1 << lengthBit)) {
      codes[index] = i
    }
  }

  return codes
}

/**
 * PAT = populate ascii table.
 */
function createPATIterator(limit: number, stepper: number): (n: number) => [result: number, nextSeed: number] | false {
  return function (n: number): [result: number, nextSeed: number] | false {
    if (n >= limit) {
      return false
    }

    return [n, n + (1 << stepper)]
  }
}

function populateAsciiTable(value: number, index: number, bits: number, limit: number): number[] {
  const iterator = createPATIterator(limit, value - bits)
  const seed = ChCodeAsc[index] >> bits
  const indices = unfold(iterator, seed)

  const table: number[] = []
  for (const idx of indices) {
    table[idx] = index
  }

  return table
}

export class Explode {
  private readonly verbose: boolean
  private needMoreInput: boolean
  private isFirstChunk: boolean
  private extraBits: number
  private bitBuffer: number
  private readonly backupData: { extraBits: number; bitBuffer: number }
  private readonly lengthCodes: number[]
  private readonly distPosCodes: number[]
  private readonly inputBuffer: ExpandingBuffer
  private readonly outputBuffer: ExpandingBuffer
  private readonly stats: Stats
  private compressionType: CompressionType | 'unknown'
  private dictionarySize: DictionarySize | 'unknown'
  private dictionarySizeMask: number
  private dictionarySizeBits: number
  private chBitsAsc: number[]
  private asciiTable2C34: number[]
  private asciiTable2D34: number[]
  private asciiTable2E34: number[]
  private asciiTable2EB4: number[]

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
    this.chBitsAsc = repeat(0, 0x1_00)
    this.asciiTable2C34 = repeat(0, 0x1_00)
    this.asciiTable2D34 = repeat(0, 0x1_00)
    this.asciiTable2E34 = repeat(0, 0x80)
    this.asciiTable2EB4 = repeat(0, 0x1_00)
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

  private generateAsciiTables(): void {
    this.chBitsAsc = ChBitsAsc.map((value, index) => {
      if (value <= 8) {
        this.asciiTable2C34 = mergeSparseArrays(
          populateAsciiTable(value, index, 0, 0x1_00),
          this.asciiTable2C34,
        ) as number[]

        return value
      }

      const acc = getLowestNBitsOf(ChCodeAsc[index], 8)
      if (acc === 0) {
        this.asciiTable2EB4 = mergeSparseArrays(
          populateAsciiTable(value, index, 8, 0x1_00),
          this.asciiTable2EB4,
        ) as number[]

        return value - 8
      }

      this.asciiTable2C34[acc] = 0xff

      if (getLowestNBitsOf(acc, 6) === 0) {
        this.asciiTable2E34 = mergeSparseArrays(
          populateAsciiTable(value, index, 6, 0x80),
          this.asciiTable2E34,
        ) as number[]

        return value - 6
      }

      this.asciiTable2D34 = mergeSparseArrays(
        populateAsciiTable(value, index, 4, 0x1_00),
        this.asciiTable2D34,
      ) as number[]

      return value - 4
    })
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
    if (numberOfBits > this.extraBits && this.inputBuffer.isEmpty()) {
      throw new AbortedError()
    }

    if (numberOfBits <= this.extraBits) {
      this.bitBuffer = this.bitBuffer >> numberOfBits
      this.extraBits = this.extraBits - numberOfBits
      return
    }

    const nextByte = this.inputBuffer.readByte(0)
    this.inputBuffer.dropStart(1)

    this.bitBuffer = ((this.bitBuffer >> this.extraBits) | (nextByte << 8)) >> (numberOfBits - this.extraBits)
    this.extraBits = this.extraBits + 8 - numberOfBits
  }

  /**
   * Decodes the next literal from the input.
   *
   * @throws `AbortedError`.
   */
  private decodeNextLiteral(): number {
    const lastBit = getLowestNBitsOf(this.bitBuffer, 1)

    this.wasteBits(1)

    if (lastBit !== 0) {
      let lengthCode = this.lengthCodes[getLowestNBitsOf(this.bitBuffer, 8)]

      this.wasteBits(LenBits[lengthCode])

      const extraLenghtBits = ExLenBits[lengthCode]
      if (extraLenghtBits !== 0) {
        const extraLength = getLowestNBitsOf(this.bitBuffer, extraLenghtBits)

        try {
          this.wasteBits(extraLenghtBits)
        } catch {
          if (lengthCode + extraLength !== 0x1_0e) {
            throw new AbortedError()
          }
        }

        lengthCode = LenBase[lengthCode] + extraLength
      }

      return lengthCode + 0x1_00
    }

    const lastByte = getLowestNBitsOf(this.bitBuffer, 8)

    if (this.compressionType === 'binary') {
      this.wasteBits(8)
      return lastByte
    }

    let value: number

    if (lastByte > 0) {
      value = this.asciiTable2C34[lastByte]

      if (value === 0xff) {
        if (getLowestNBitsOf(this.bitBuffer, 6) === 0) {
          this.wasteBits(6)
          value = this.asciiTable2E34[getLowestNBitsOf(this.bitBuffer, 7)]
        } else {
          this.wasteBits(4)
          value = this.asciiTable2D34[getLowestNBitsOf(this.bitBuffer, 8)]
        }
      }
    } else {
      this.wasteBits(8)
      value = this.asciiTable2EB4[getLowestNBitsOf(this.bitBuffer, 8)]
    }

    this.wasteBits(this.chBitsAsc[value])

    return value
  }

  /**
   * Decodes the distance of a repetition.
   *
   * @throws `AbortedError`.
   */
  private decodeDistance(repeatLength: number): number {
    const distPosCode = this.distPosCodes[getLowestNBitsOf(this.bitBuffer, 8)]
    const distPosBits = DistBits[distPosCode]

    this.wasteBits(distPosBits)

    let distance: number
    let bitsToWaste: number

    if (repeatLength === 2) {
      distance = (distPosCode << 2) | getLowestNBitsOf(this.bitBuffer, 2)
      bitsToWaste = 2
    } else {
      distance = (distPosCode << this.dictionarySizeBits) | (this.bitBuffer & this.dictionarySizeMask)
      bitsToWaste = this.dictionarySizeBits
    }

    this.wasteBits(bitsToWaste)

    return distance + 1
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
    if (this.inputBuffer.size() < 4) {
      return false
    }

    const { compressionType, dictionarySize } = readHeader(this.inputBuffer.read(0, 2))

    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.bitBuffer = this.inputBuffer.readByte(2)
    this.inputBuffer.dropStart(3)
    this.dictionarySizeBits = DICTIONARY_CODES[dictionarySize]
    this.dictionarySizeMask = nBitsOfOnes(this.dictionarySizeBits)

    if (this.compressionType === 'ascii') {
      this.generateAsciiTables()
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
