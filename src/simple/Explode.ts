import {
  ChBitsAsc,
  ChCodeAsc,
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
import {
  quotientAndRemainder,
  getLowestNBitsOf,
  mergeSparseArrays,
  nBitsOfOnes,
  repeat,
  unfold,
  concatArrayBuffers,
  sliceArrayBufferAt,
} from '@src/functions.js'

/**
 * This function assumes there are at least 2 bytes of data in the buffer
 */
function readHeader(buffer: ArrayBufferLike): {
  compressionType: 'ascii' | 'binary'
  dictionarySize: 'small' | 'medium' | 'large'
} {
  let compressionType: 'ascii' | 'binary'

  const view = new Uint8Array(buffer)

  switch (view[0]) {
    case 0: {
      compressionType = 'binary'
      break
    }

    case 1: {
      compressionType = 'ascii'
      break
    }

    default: {
      throw new InvalidCompressionTypeError()
    }
  }

  let dictionarySize: 'small' | 'medium' | 'large'

  switch (view[1]) {
    case 4: {
      dictionarySize = 'small'
      break
    }

    case 5: {
      dictionarySize = 'medium'
      break
    }

    case 6: {
      dictionarySize = 'large'
      break
    }

    default: {
      throw new InvalidDictionarySizeError()
    }
  }

  return {
    compressionType,
    dictionarySize,
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
  indices.forEach((idx) => {
    table[idx] = index
  })

  return table
}

export class Explode {
  private needMoreInput: boolean
  private extraBits: number
  private bitBuffer: number
  private readonly lengthCodes: number[]
  private readonly distPosCodes: number[]
  private inputBuffer: ArrayBufferLike
  private inputBufferStartIndex: number
  private outputBuffer: ArrayBufferLike
  private compressionType: 'ascii' | 'binary' | 'unknown'
  private dictionarySize: 'small' | 'medium' | 'large' | 'unknown'
  private dictionarySizeMask: number
  private chBitsAsc: number[]
  private asciiTable2C34: number[]
  private asciiTable2D34: number[]
  private asciiTable2E34: number[]
  private asciiTable2EB4: number[]

  constructor() {
    this.needMoreInput = true
    this.extraBits = 0
    this.bitBuffer = 0
    this.lengthCodes = generateDecodeTables(LenCode, LenBits)
    this.distPosCodes = generateDecodeTables(DistCode, DistBits)
    this.inputBuffer = EMPTY_BUFFER
    this.inputBufferStartIndex = 0
    this.outputBuffer = EMPTY_BUFFER
    this.compressionType = 'unknown'
    this.dictionarySize = 'unknown'
    this.dictionarySizeMask = 0
    this.chBitsAsc = repeat(0, 0x1_00)
    this.asciiTable2C34 = repeat(0, 0x1_00)
    this.asciiTable2D34 = repeat(0, 0x1_00)
    this.asciiTable2E34 = repeat(0, 0x80)
    this.asciiTable2EB4 = repeat(0, 0x1_00)
  }

  /**
   * @throws {InvalidCompressionTypeError}
   * @throws {InvalidDictionarySizeError}
   * @throws {AbortedError}
   */
  handleData(input: ArrayBufferLike): ArrayBufferLike {
    this.needMoreInput = true

    this.inputBuffer = input
    this.inputBufferStartIndex = 0

    this.processChunkData()

    const blockSize = 0x10_00

    let output: ArrayBufferLike = EMPTY_BUFFER

    if (this.outputBuffer.byteLength > blockSize) {
      let [numberOfBlocks] = quotientAndRemainder(this.outputBuffer.byteLength, blockSize)

      // making sure to leave one block worth of data for lookback when processing chunk data
      numberOfBlocks = numberOfBlocks - 1

      const numberOfBytes = numberOfBlocks * blockSize
      // TODO: do we need this slicing here...
      output = this.outputBuffer.slice(0, numberOfBytes)
      this.outputBuffer = this.outputBuffer.slice(numberOfBytes)
    }

    // -----------------

    if (this.needMoreInput) {
      throw new AbortedError()
    }

    return concatArrayBuffers([output, this.outputBuffer])
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

  /**
   * @throws {@link AbortedError} when there isn't enough data to be wasted
   */
  private wasteBits(numberOfBits: number): void {
    if (numberOfBits > this.extraBits && this.inputBuffer.byteLength - this.inputBufferStartIndex === 0) {
      throw new AbortedError()
    }

    if (numberOfBits <= this.extraBits) {
      this.bitBuffer = this.bitBuffer >> numberOfBits
      this.extraBits = this.extraBits - numberOfBits
      return
    }

    const nextByte = new Uint8Array(this.inputBuffer)[this.inputBufferStartIndex]
    this.inputBufferStartIndex = this.inputBufferStartIndex + 1

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

    if (this.compressionType === 'binary') {
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
      switch (this.dictionarySize as 'small' | 'medium' | 'large') {
        case 'small': {
          distance = (distPosCode << 4) | (this.bitBuffer & this.dictionarySizeMask)
          bitsToWaste = 4
          break
        }

        case 'medium': {
          distance = (distPosCode << 5) | (this.bitBuffer & this.dictionarySizeMask)
          bitsToWaste = 5
          break
        }

        case 'large': {
          distance = (distPosCode << 6) | (this.bitBuffer & this.dictionarySizeMask)
          bitsToWaste = 6
          break
        }
      }
    }

    this.wasteBits(bitsToWaste)

    return distance + 1
  }

  private processChunkData(): void {
    if (this.inputBuffer.byteLength - this.inputBufferStartIndex === 0) {
      return
    }

    if (this.compressionType === 'unknown') {
      const headerParsedSuccessfully = this.parseInitialData()
      if (!headerParsedSuccessfully || this.inputBuffer.byteLength - this.inputBufferStartIndex === 0) {
        return
      }
    }

    this.needMoreInput = false

    const additions: ArrayBufferLike[] = []
    const finalizedChunks: ArrayBufferLike[] = []
    const blockSize = 0x10_00

    try {
      let nextLiteral = this.decodeNextLiteral()

      while (nextLiteral !== LITERAL_END_STREAM) {
        let addition: ArrayBufferLike

        if (nextLiteral >= 0x1_00) {
          const repeatLength = nextLiteral - 0xfe

          const minusDistance = this.decodeDistance(repeatLength)

          if (additions.length > 0) {
            this.outputBuffer = concatArrayBuffers([this.outputBuffer, ...additions])
            additions.length = 0

            if (this.outputBuffer.byteLength > blockSize * 2) {
              const [a, b] = sliceArrayBufferAt(this.outputBuffer, blockSize)
              finalizedChunks.push(a)
              this.outputBuffer = b
            }
          }

          const start = this.outputBuffer.byteLength - minusDistance
          const availableData = this.outputBuffer.slice(start, start + repeatLength)

          if (repeatLength > minusDistance) {
            const multipliedData = repeat(availableData, Math.ceil(repeatLength / availableData.byteLength))
            addition = concatArrayBuffers(multipliedData).slice(0, repeatLength)
          } else {
            addition = availableData
          }
        } else {
          addition = new ArrayBuffer(1)
          const additionView = new Uint8Array(addition)
          additionView[0] = nextLiteral
        }

        additions.push(addition)

        nextLiteral = this.decodeNextLiteral()
      }
    } catch {
      this.needMoreInput = true
    }

    this.outputBuffer = concatArrayBuffers([...finalizedChunks, this.outputBuffer, ...additions])
  }

  private parseInitialData(): boolean {
    if (this.inputBuffer.byteLength - this.inputBufferStartIndex < 4) {
      return false
    }

    const { compressionType, dictionarySize } = readHeader(
      this.inputBuffer.slice(this.inputBufferStartIndex, this.inputBufferStartIndex + 2),
    )

    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.bitBuffer = new Uint8Array(this.inputBuffer)[this.inputBufferStartIndex + 2]
    this.inputBufferStartIndex = this.inputBufferStartIndex + 3

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

    if (this.compressionType === 'ascii') {
      this.generateAsciiTables()
    }

    return true
  }
}
