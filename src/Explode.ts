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
} from './constants.js'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from './errors.js'
import { ExpandingBuffer } from './ExpandingBuffer.js'
import { evenAndRemainder, getLowestNBits, mergeSparseArrays, nBitsOfOnes, repeat, toHex, unfold } from './functions.js'
import { type Config, type Stats } from './types.js'

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
function createPATIterator(limit: number, stepper: number) {
  return function (n: number): false | [number, number] {
    if (n >= limit) {
      return false
    }

    return [n, n + (1 << stepper)] as [number, number]
  }
}

function populateAsciiTable(value: number, index: number, bits: number, limit: number): number[] {
  const iterator = createPATIterator(limit, value - bits)
  const seed = ChCodeAsc[index] >> bits
  const idxs = unfold(iterator, seed)

  const table: number[] = []
  idxs.forEach((idx) => {
    table[idx] = index
  })

  return table
}

export class Explode {
  private readonly verbose: boolean
  private needMoreInput: boolean = true
  private isFirstChunk: boolean = true
  private extraBits: number = 0
  private bitBuffer: number = 0
  private readonly backupData: { extraBits: number; bitBuffer: number } = {
    extraBits: -1,
    bitBuffer: -1,
  }

  private readonly lengthCodes: number[] = generateDecodeTables(LenCode, LenBits)
  private readonly distPosCodes: number[] = generateDecodeTables(DistCode, DistBits)
  private readonly inputBuffer: ExpandingBuffer
  private readonly outputBuffer: ExpandingBuffer
  private readonly stats: Stats = { chunkCounter: 0 }
  private compressionType: Compression = Compression.Unknown
  private dictionarySize: DictionarySize = DictionarySize.Unknown
  private dictionarySizeMask: number = 0
  private chBitsAsc: number[] = repeat(0, 0x1_00)
  private asciiTable2C34: number[] = repeat(0, 0x1_00)
  private asciiTable2D34: number[] = repeat(0, 0x1_00)
  private asciiTable2E34: number[] = repeat(0, 0x80)
  private asciiTable2EB4: number[] = repeat(0, 0x1_00)

  constructor(config: Config = {}) {
    this.verbose = config?.verbose ?? false
    this.inputBuffer = new ExpandingBuffer(config?.inputBufferSize ?? 0)
    this.outputBuffer = new ExpandingBuffer(config?.outputBufferSize ?? 0)
  }

  getHandler() {
    const explodeInstance = this

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
      explodeInstance.needMoreInput = true

      try {
        explodeInstance.inputBuffer.append(chunk)

        if (explodeInstance.isFirstChunk) {
          explodeInstance.isFirstChunk = false
          this._flush = explodeInstance.onInputFinished.bind(explodeInstance)
        }

        if (explodeInstance.verbose) {
          explodeInstance.stats.chunkCounter++
          console.log(`explode: reading ${toHex(chunk.length)} bytes from chunk #${explodeInstance.stats.chunkCounter}`)
        }

        explodeInstance.processChunkData()

        const blockSize = 0x10_00

        if (explodeInstance.outputBuffer.size() <= blockSize) {
          callback(null, EMPTY_BUFFER)
          return
        }

        let [numberOfBlocks] = evenAndRemainder(blockSize, explodeInstance.outputBuffer.size())

        // making sure to leave one block worth of data for lookback when processing chunk data
        numberOfBlocks--

        const numberOfBytes = numberOfBlocks * blockSize
        // make sure to create a copy of the output buffer slice as it will get flushed in the next line
        const output = Buffer.from(explodeInstance.outputBuffer.read(0, numberOfBytes))
        explodeInstance.outputBuffer.flushStart(numberOfBytes)

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

      const acc = getLowestNBits(8, ChCodeAsc[index])
      if (acc === 0) {
        this.asciiTable2EB4 = mergeSparseArrays(
          populateAsciiTable(value, index, 8, 0x1_00),
          this.asciiTable2EB4,
        ) as number[]
        return value - 8
      }

      this.asciiTable2C34[acc] = 0xff

      if (getLowestNBits(6, acc) === 0) {
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
    const lastBit = getLowestNBits(1, this.bitBuffer)

    this.wasteBits(1)

    if (lastBit) {
      let lengthCode = this.lengthCodes[getLowestNBits(8, this.bitBuffer)]

      this.wasteBits(LenBits[lengthCode])

      const extraLenghtBits = ExLenBits[lengthCode]
      if (extraLenghtBits !== 0) {
        const extraLength = getLowestNBits(extraLenghtBits, this.bitBuffer)

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

    const lastByte = getLowestNBits(8, this.bitBuffer)

    if (this.compressionType === Compression.Binary) {
      this.wasteBits(8)
      return lastByte
    }

    let value: number

    if (lastByte > 0) {
      value = this.asciiTable2C34[lastByte]

      if (value === 0xff) {
        if (getLowestNBits(6, this.bitBuffer)) {
          this.wasteBits(4)

          value = this.asciiTable2D34[getLowestNBits(8, this.bitBuffer)]
        } else {
          this.wasteBits(6)

          value = this.asciiTable2E34[getLowestNBits(7, this.bitBuffer)]
        }
      }
    } else {
      this.wasteBits(8)

      value = this.asciiTable2EB4[getLowestNBits(8, this.bitBuffer)]
    }

    this.wasteBits(this.chBitsAsc[value])

    return value
  }

  /**
   * @throws {@link AbortedError}
   */
  private decodeDistance(repeatLength: number): number {
    const distPosCode = this.distPosCodes[getLowestNBits(8, this.bitBuffer)]
    const distPosBits = DistBits[distPosCode]

    this.wasteBits(distPosBits)

    let distance: number
    let bitsToWaste: number

    if (repeatLength === 2) {
      distance = (distPosCode << 2) | getLowestNBits(2, this.bitBuffer)
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
