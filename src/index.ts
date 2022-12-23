import { Compression, DictionarySize } from './constants'
import { Explode } from './Explode'
import { Implode } from './Implode'
import { Config } from './types'

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

export { Compression, DictionarySize } from './constants'
export * as errors from './errors'
export * as stream from './stream'
export type { Config } from './types'
