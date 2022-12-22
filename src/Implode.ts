import { Buffer } from 'node:buffer'
import { Transform, TransformCallback } from 'node:stream'
import { ExpandingBuffer } from './ExpandingBuffer'
import { Config, Stats } from './types'

export class Implode {
  #verbose: boolean
  #inputBuffer: ExpandingBuffer
  #outputBuffer: ExpandingBuffer
  #stats: Stats = { chunkCounter: 0 }

  constructor(config: Config) {
    this.#verbose = config?.verbose ?? false
    this.#inputBuffer = new ExpandingBuffer(config?.inputBufferSize ?? 0)
    this.#outputBuffer = new ExpandingBuffer(config?.outputBufferSize ?? 0)
  }

  getHandler() {
    const instance = this

    return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
      // TODO: implement the rest of the handler
    }
  }
}
