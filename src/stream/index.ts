import type { Compression, DictionarySize } from '@src/stream/constants.js'
import { Explode } from '@src/stream/Explode.js'
import { Implode } from '@src/stream/Implode.js'
import type { StreamHandler } from '@src/stream/stream.js'
import type { Config } from '@src/stream/types.js'

/**
 * Decompresses stream
 * @returns a function that you can use as a `transform._transform` method.
 */
export function explode(config: Config = {}): StreamHandler {
  const instance = new Explode(config)
  return instance.getHandler()
}

/**
 * Compresses stream
 * @returns a function that you can use as a `transform._transform` method.
 */
export function implode(
  compressionType: Compression,
  dictionarySize: DictionarySize,
  config: Config = {},
): StreamHandler {
  const instance = new Implode(compressionType, dictionarySize, config)
  return instance.getHandler()
}

export { explode as decompress }
export { implode as compress }

export { Compression, DictionarySize } from '@src/stream/constants.js'
export * as errors from '@src/errors.js'
export * as stream from '@src/stream/stream.js'
export type { Config } from '@src/stream/types.js'
