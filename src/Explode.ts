import { Buffer } from 'node:buffer'
import { Transform, TransformCallback } from 'node:stream'
import { AbortedError } from './errors'
import { ExpandingBuffer } from './ExpandingBuffer'
import { repeat, toHex } from './functions'
import { Config, Stats } from './types'

export class Explode {
  private verbose: boolean
  private needMoreInput: boolean = true
  private isFirstChunk: boolean = true
  private extraBits: number = 0
  private bitBuffer: number = 0
  private backupExtraBits: number = -1
  private backupBitBuffer: number = -1
  private chBitsAsc: number[] = repeat(0, 0x100)
  // private lengthCodes
  // private distPosCodes
  private inputBuffer: ExpandingBuffer
  private outputBuffer: ExpandingBuffer
  private stats: Stats = { chunkCounter: 0 }

  private constructor(config: Config = {}) {
    this.verbose = config?.verbose ?? false
    this.inputBuffer = new ExpandingBuffer(config?.inputBufferSize ?? 0)
    this.outputBuffer = new ExpandingBuffer(config?.outputBufferSize ?? 0)
  }

  static getHandler(config: Config = {}) {
    const self = new Explode(config)

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
      self.needMoreInput = true

      try {
        self.inputBuffer.append(chunk)
        if (self.isFirstChunk) {
          self.isFirstChunk = false
          this._flush = self.onInputFinished.bind(self)
        }

        if (self.verbose) {
          self.stats.chunkCounter++
          console.log(`explode: reading ${toHex(chunk.length)} bytes from chunk #${self.stats.chunkCounter}`)
        }

        // TODO: migrate the rest of the function
      } catch (e: unknown) {
        callback(e as Error)
      }
    }
  }

  private onInputFinished(callback: TransformCallback) {
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
  }

  private backup() {
    this.backupExtraBits = this.extraBits
    this.backupBitBuffer = this.bitBuffer
    this.inputBuffer.saveIndices()
  }

  private restore() {
    this.extraBits = this.backupExtraBits
    this.bitBuffer = this.backupBitBuffer
    this.inputBuffer.restoreIndices()
  }
}
