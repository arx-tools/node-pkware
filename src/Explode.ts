import { Buffer } from 'node:buffer'
import { Transform, TransformCallback } from 'node:stream'
import { Compression, DictionarySize, DistBits, DistCode, LenBits, LenCode } from './constants'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from './errors'
import { ExpandingBuffer } from './ExpandingBuffer'
import { nBitsOfOnes, repeat, toHex } from './functions'
import { Config, Stats } from './types'

/**
 * This function assumes there are at least 2 bytes of data in the buffer
 */
const readHeader = (buffer: Buffer) => {
  const compressionType = buffer.readUInt8(0)
  const dictionarySizeBits = buffer.readUInt8(1)

  if (!(compressionType in Compression) || compressionType === Compression.Unknown) {
    throw new InvalidCompressionTypeError()
  }

  if (!(dictionarySizeBits in DictionarySize) || dictionarySizeBits === DictionarySize.Unknown) {
    throw new InvalidDictionarySizeError()
  }

  return {
    compressionType,
    dictionarySizeBits,
  }
}

const generateDecodeTables = (startIndexes: number[], lengthBits: number[]) => {
  const codes = repeat(0, 0x100)

  lengthBits.forEach((lengthBit, i) => {
    for (let index = startIndexes[i]; index < 0x100; index += 1 << lengthBit) {
      codes[index] = i
    }
  })

  return codes
}

export class Explode {
  #verbose: boolean
  #needMoreInput: boolean = true
  #isFirstChunk: boolean = true
  #extraBits: number = 0
  #bitBuffer: number = 0
  #backupData: { extraBits: number; bitBuffer: number } = {
    extraBits: -1,
    bitBuffer: -1,
  }
  #chBitsAsc: number[] = repeat(0, 0x100)
  #lengthCodes: number[] = generateDecodeTables(LenCode, LenBits)
  #distPosCodes: number[] = generateDecodeTables(DistCode, DistBits)
  #inputBuffer: ExpandingBuffer
  #outputBuffer: ExpandingBuffer
  #stats: Stats = { chunkCounter: 0 }
  #compressionType: Compression = Compression.Unknown
  #dictionarySizeBits: DictionarySize = DictionarySize.Unknown
  #dictionarySizeMask: number = 0

  constructor(config: Config = {}) {
    this.#verbose = config?.verbose ?? false
    this.#inputBuffer = new ExpandingBuffer(config?.inputBufferSize ?? 0)
    this.#outputBuffer = new ExpandingBuffer(config?.outputBufferSize ?? 0)
  }

  getHandler() {
    const instance = this

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
      instance.#needMoreInput = true

      try {
        instance.#inputBuffer.append(chunk)

        if (instance.#isFirstChunk) {
          instance.#isFirstChunk = false
          this._flush = instance.#onInputFinished.bind(instance)
        }

        if (instance.#verbose) {
          instance.#stats.chunkCounter++
          console.log(`explode: reading ${toHex(chunk.length)} bytes from chunk #${instance.#stats.chunkCounter}`)
        }

        instance.#processChunkData()

        // TODO: migrate the rest of the function
      } catch (e: unknown) {
        callback(e as Error)
      }
    }
  }

  #onInputFinished(callback: TransformCallback) {
    if (this.#verbose) {
      console.log('---------------')
      console.log('explode: total number of chunks read:', this.#stats.chunkCounter)
      console.log('explode: inputBuffer heap size', toHex(this.#inputBuffer.heapSize()))
      console.log('explode: outputBuffer heap size', toHex(this.#outputBuffer.heapSize()))
    }

    if (this.#needMoreInput) {
      callback(new AbortedError())
      return
    }

    callback(null, this.#outputBuffer.read())
  }

  #processChunkData() {
    if (this.#inputBuffer.isEmpty()) {
      return
    }

    if (this.#compressionType === Compression.Unknown) {
      const headerParsedSuccessfully = this.#parseInitialData()
      if (!headerParsedSuccessfully || this.#inputBuffer.isEmpty()) {
        return
      }
    }

    // TODO: implement the rest of the method
  }

  #parseInitialData() {
    if (this.#inputBuffer.size() < 4) {
      return false
    }

    const { compressionType, dictionarySizeBits } = readHeader(this.#inputBuffer.read(0, 2))

    this.#compressionType = compressionType
    this.#dictionarySizeBits = dictionarySizeBits
    this.#bitBuffer = this.#inputBuffer.readByte(2)
    this.#inputBuffer.dropStart(3)
    this.#dictionarySizeMask = nBitsOfOnes(dictionarySizeBits)

    // TODO: implement the rest of the method
  }

  #backup() {
    this.#backupData.extraBits = this.#extraBits
    this.#backupData.bitBuffer = this.#bitBuffer
    this.#inputBuffer.saveIndices()
  }

  #restore() {
    this.#extraBits = this.#backupData.extraBits
    this.#bitBuffer = this.#backupData.bitBuffer
    this.#inputBuffer.restoreIndices()
  }
}
