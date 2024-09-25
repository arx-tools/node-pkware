import { type Compression, type DictionarySize } from '@src/constants.js'
import { Explode } from '@src/Explode.js'
import { Implode } from '@src/Implode.js'
import { type Config } from '@src/types.js'

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

export { Compression, DictionarySize } from '@src/constants.js'
export * as errors from '@src/errors.js'
export * as stream from '@src/stream.js'
export type { Config } from '@src/types.js'
