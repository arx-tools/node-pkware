import { Compression, DictionarySize } from './constants.js'
import { Explode } from './Explode.js'
import { Implode } from './Implode.js'
import { Config } from './types.js'

/**
 * Decompresses stream
 * @returns a function that you can use as a `transform._transform` method.
 */
export const explode = (config: Config = {}) => {
  const instance = new Explode(config)
  return instance.getHandler()
}

/**
 * Compresses stream
 * @returns a function that you can use as a `transform._transform` method.
 */
export const implode = (compressionType: Compression, dictionarySize: DictionarySize, config: Config = {}) => {
  const instance = new Implode(compressionType, dictionarySize, config)
  return instance.getHandler()
}

export { explode as decompress }
export { implode as compress }

export { Compression, DictionarySize } from './constants.js'
export * as errors from './errors.js'
export * as stream from './stream.js'
export type { Config } from './types.js'
