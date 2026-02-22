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
  getLowestNBitsOf,
  mergeSparseArrays,
  nBitsOfOnes,
  repeat,
  unfold,
  concatArrayBuffersAndLengthedDatas,
  sliceArrayBufferAt,
  uint8ArrayToArray,
} from '@src/functions.js'
import type { CompressionType, DictionarySize } from '@src/simple/types.js'

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
  private readonly inputBuffer: ArrayBufferLike
  /**
   * Used for accessing the data within inputBuffer
   */
  private readonly inputBufferView: Uint8Array
  /**
   * Used for caching inputBuffer.byteLength as that getter is doing some uncached computation to measure the length of
   * inputBuffer
   */
  private readonly inputBufferSize: number
  /**
   * The explode algorithm works by trimming off the beginning of inputBuffer byte by byte. Instead of actually
   * adjusting the inputBuffer every time a byte is handled we store the beginning of the unhandled section and use it
   * when indexing data that is being read.
   */
  private inputBufferStartIndex: number

  private outputBuffer: ArrayBuffer
  private outputBufferView: Uint8Array
  private outputBufferSize: number

  private needMoreInput: boolean
  private extraBits: number
  private bitBuffer: number
  private readonly lengthCodes: number[]
  private readonly distPosCodes: number[]

  private compressionType: CompressionType | 'unknown'
  private dictionarySize: DictionarySize | 'unknown'
  private dictionarySizeMask: number
  private chBitsAsc: number[]
  /**
   * the naming comes from stormlib, the 2C34 refers to the table's position in memory
   */
  private asciiTable2C34: number[]
  /**
   * the naming comes from stormlib, the 2D34 refers to the table's position in memory
   */
  private asciiTable2D34: number[]
  /**
   * the naming comes from stormlib, the 2E34 refers to the table's position in memory
   */
  private asciiTable2E34: number[]
  /**
   * the naming comes from stormlib, the 2EB4 refers to the table's position in memory
   */
  private asciiTable2EB4: number[]

  constructor(input: ArrayBufferLike) {
    this.needMoreInput = true
    this.extraBits = 0
    this.bitBuffer = 0
    this.lengthCodes = generateDecodeTables(LenCode, LenBits)
    this.distPosCodes = generateDecodeTables(DistCode, DistBits)

    this.inputBuffer = input
    this.inputBufferView = new Uint8Array(this.inputBuffer)
    this.inputBufferSize = this.inputBuffer.byteLength
    this.inputBufferStartIndex = 0

    this.outputBuffer = EMPTY_BUFFER
    this.outputBufferView = new Uint8Array(this.outputBuffer)
    this.outputBufferSize = 0

    this.compressionType = 'unknown'
    this.dictionarySize = 'unknown'
    this.dictionarySizeMask = 0
    this.chBitsAsc = repeat(0, 0x1_00)
    this.asciiTable2C34 = repeat(0, 0x1_00)
    this.asciiTable2D34 = repeat(0, 0x1_00)
    this.asciiTable2E34 = repeat(0, 0x80)
    this.asciiTable2EB4 = repeat(0, 0x1_00)

    this.processInput()

    if (this.needMoreInput) {
      throw new AbortedError()
    }
  }

  /**
   * @throws `InvalidCompressionTypeError`
   * @throws `InvalidDictionarySizeError`
   * @throws `AbortedError`
   */
  getResult(): ArrayBuffer {
    return this.outputBuffer.slice(0, this.outputBufferSize)
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
   * @throws `AbortedError` when there isn't enough data to be wasted
   */
  private wasteBits(numberOfBits: number): void {
    if (numberOfBits > this.extraBits && this.inputBufferSize - this.inputBufferStartIndex === 0) {
      throw new AbortedError()
    }

    if (numberOfBits <= this.extraBits) {
      this.bitBuffer = this.bitBuffer >> numberOfBits
      this.extraBits = this.extraBits - numberOfBits
      return
    }

    const nextByte = this.inputBufferView[this.inputBufferStartIndex]
    this.inputBufferStartIndex = this.inputBufferStartIndex + 1

    this.bitBuffer = ((this.bitBuffer >> this.extraBits) | (nextByte << 8)) >> (numberOfBits - this.extraBits)
    this.extraBits = this.extraBits + 8 - numberOfBits
  }

  /**
   * @throws `AbortedError`
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
   * @throws `AbortedError`
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
      switch (this.dictionarySize as DictionarySize) {
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

  private processInput(): void {
    const headerParsedSuccessfully = this.parseInitialData()
    if (!headerParsedSuccessfully || this.inputBufferSize - this.inputBufferStartIndex === 0) {
      return
    }

    this.needMoreInput = false

    const additions: Array<ArrayBufferLike | { data: number[]; byteLength: number }> = []
    let additionsByteSum = 0
    const finalizedChunks: ArrayBufferLike[] = []
    const blockSize = 0x10_00

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
        if (this.outputBufferSize + additionsByteSum > blockSize * 2) {
          this.outputBufferSize = this.outputBufferSize + additionsByteSum
          this.outputBuffer = concatArrayBuffersAndLengthedDatas(
            [this.outputBuffer, ...additions],
            this.outputBufferSize,
          )
          this.outputBufferView = new Uint8Array(this.outputBuffer)
          additions.length = 0
          additionsByteSum = 0

          const [a, b] = sliceArrayBufferAt(this.outputBuffer, blockSize)
          finalizedChunks.push(a)
          this.outputBuffer = b
          this.outputBufferView = new Uint8Array(this.outputBuffer)
          this.outputBufferSize = this.outputBufferSize - blockSize
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

    this.outputBufferSize = finalizedChunks.length * blockSize + this.outputBufferSize + additionsByteSum
    this.outputBuffer = concatArrayBuffersAndLengthedDatas(
      [...finalizedChunks, this.outputBuffer, ...additions],
      this.outputBufferSize,
    )
    this.outputBufferView = new Uint8Array(this.outputBuffer)
  }

  private parseInitialData(): boolean {
    if (this.inputBufferSize < 4) {
      return false
    }

    const { compressionType, dictionarySize } = this.readHeader()

    this.compressionType = compressionType
    this.dictionarySize = dictionarySize
    this.bitBuffer = this.inputBufferView[this.inputBufferStartIndex + 2]
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

  /**
   * This function assumes there are at least 2 bytes of data in the buffer
   *
   * @throws `InvalidCompressionTypeError`
   * @throws `InvalidDictionarySizeError`
   */
  private readHeader(): {
    compressionType: CompressionType
    dictionarySize: DictionarySize
  } {
    let compressionType: CompressionType

    switch (this.inputBufferView[0]) {
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

    let dictionarySize: DictionarySize

    switch (this.inputBufferView[1]) {
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
}
