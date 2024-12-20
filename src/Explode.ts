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
  LenBase,
  LenBits,
  LenCode,
  LITERAL_END_STREAM,
} from '@src/constants.js'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from '@src/errors.js'
import { ExpandingBuffer } from '@src/ExpandingBuffer.js'
import {
  quotientAndRemainder,
  getLowestNBitsOf,
  mergeSparseArrays,
  nBitsOfOnes,
  repeat,
  toHex,
  unfold,
} from '@src/functions.js'
import { type Config, type Stats } from '@src/types.js'

/**
 * This function assumes there are at least 2 bytes of data in the buffer
 */
function readHeader(buffer: Buffer): { compressionType: Compression; dictionarySize: DictionarySize } {
  const compressionType = buffer.readUInt8(0)
  const dictionarySize = buffer.readUInt8(1)

  if (!(compressionType in Compression) || compressionType === Compression.Unknown) {
    throw new InvalidCompressionTypeError()
  }

  if (!(dictionarySize in DictionarySize) || dictionarySize === DictionarySize.Unknown) {
    throw new InvalidDictionarySizeError()
  }

  return {
    compressionType: compressionType as Compression,
    dictionarySize: dictionarySize as DictionarySize,
  }
}

function generateDecodeTables(startIndexes: number[], lengthBits: number[]): number[] {
  const codes = repeat(0, 0x1_00)

  lengthBits.forEach((lengthBit, i) => {
    for (let index = startIndexes[i]; index < 0x1_00; index = index + (1 << lengthBit)) {
      codes[index] = i
    }
  })

  return codes
}

/**
 * PAT = populate ascii table
 */
function createPATIterator(limit: number, stepper: number): (n: number) => [number, number] | false {
  return function (n: number): [number, number] | false {
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
  indices.forEach((idx) => {
    table[idx] = index
  })

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
  private compressionType: Compression
  private dictionarySize: DictionarySize
  private dictionarySizeMask: number
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
    this.compressionType = Compression.Unknown
    this.dictionarySize = DictionarySize.Unknown
    this.dictionarySizeMask = 0
    this.chBitsAsc = repeat(0, 0x1_00)
    this.asciiTable2C34 = repeat(0, 0x1_00)
    this.asciiTable2D34 = repeat(0, 0x1_00)
    this.asciiTable2E34 = repeat(0, 0x80)
    this.asciiTable2EB4 = repeat(0, 0x1_00)
  }

  getHandler() {
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

        const blockSize = 0x10_00

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

        return value - 0
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
   * @throws {@link AbortedError} when there isn't enough data to be wasted
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
   * @throws {@link AbortedError}
   */
  private decodeNextLiteral(): number {
    const lastBit = getLowestNBitsOf(this.bitBuffer, 1)

    this.wasteBits(1)

    if (lastBit) {
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

    if (this.compressionType === Compression.Binary) {
      this.wasteBits(8)
      return lastByte
    }

    let value: number

    if (lastByte > 0) {
      value = this.asciiTable2C34[lastByte]

      if (value === 0xff) {
        if (getLowestNBitsOf(this.bitBuffer, 6)) {
          this.wasteBits(4)
          value = this.asciiTable2D34[getLowestNBitsOf(this.bitBuffer, 8)]
        } else {
          this.wasteBits(6)
          value = this.asciiTable2E34[getLowestNBitsOf(this.bitBuffer, 7)]
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
   * @throws {@link AbortedError}
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
      distance = (distPosCode << this.dictionarySize) | (this.bitBuffer & this.dictionarySizeMask)
      bitsToWaste = this.dictionarySize
    }

    this.wasteBits(bitsToWaste)

    return distance + 1
  }

  private processChunkData(): void {
    if (this.inputBuffer.isEmpty()) {
      return
    }

    if (this.compressionType === Compression.Unknown) {
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

  private parseInitialData(): boolean {
    if (this.inputBuffer.size() < 4) {
      return false
    }

    const { compressionType, dictionarySize } = readHeader(this.inputBuffer.read(0, 2))

    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.bitBuffer = this.inputBuffer.readByte(2)
    this.inputBuffer.dropStart(3)
    this.dictionarySizeMask = nBitsOfOnes(dictionarySize)

    if (this.compressionType === Compression.Ascii) {
      this.generateAsciiTables()
    }

    if (this.verbose) {
      console.log(`explode: compression type: ${Compression[this.compressionType]}`)
      console.log(`explode: compression level: ${DictionarySize[this.dictionarySize]}`)
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
