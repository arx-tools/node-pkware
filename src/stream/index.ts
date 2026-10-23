import type { CompressionType, DictionarySize } from '../types.ts'
import { Explode } from './Explode.ts'
import { Implode } from './Implode.ts'
import type { StreamHandler } from './stream.ts'
import type { Config } from './types.ts'

/**
 * Decompresses stream
 *
 * @returns a function that you can use as a `transform._transform` method.
 */
export function explode(config: Config = {}): StreamHandler {
  const instance = new Explode(config)
  return instance.getHandler()
}

/**
 * Compresses stream
 *
 * @returns a function that you can use as a `transform._transform` method.
 */
export function implode(
  compressionType: CompressionType,
  dictionarySize: DictionarySize,
  config: Config = {},
): StreamHandler {
  const instance = new Implode(compressionType, dictionarySize, config)
  return instance.getHandler()
}

export { explode as decompress }
export { implode as compress }

export type { CompressionType, DictionarySize } from '../types.ts'
export * as errors from '../errors.ts'
export * as stream from './stream.ts'
export type { Config } from './types.ts'
