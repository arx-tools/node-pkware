import { Buffer } from 'node:buffer'
import { Callback, Config } from './types'

export class Implode {
  private verbose: boolean

  constructor(config: Config) {
    this.verbose = config?.verbose ?? false
  }

  handler(chunk: Buffer, encoding: string, callback: Callback) {}
}
