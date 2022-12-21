import { Buffer } from 'node:buffer'
import { Transform, TransformCallback } from 'node:stream'
import { AbortedError } from './errors'
import { ExpandingBuffer } from './ExpandingBuffer'
import { repeat, toHex } from './functions'
import { Config, Stats } from './types'

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
  // #lengthCodes
  // #distPosCodes
  #inputBuffer: ExpandingBuffer
  #outputBuffer: ExpandingBuffer
  #stats: Stats = { chunkCounter: 0 }

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
