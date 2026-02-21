import { Explode } from '@src/simple/Explode.js'
import { Implode } from '@src/simple/Implode.js'
import type { CompressionType, DictionarySize } from '@src/simple/types.js'

export function explode(input: ArrayBufferLike): ArrayBuffer {
  const instance = new Explode(input)
  return instance.getResult()
}

export function implode(
  input: ArrayBufferLike,
  compressionType: CompressionType,
  dictionarySize: DictionarySize,
): ArrayBuffer {
  const instance = new Implode(input, compressionType, dictionarySize)
  return instance.getResult()
}

export { explode as decompress }
export { implode as compress }

// -----------------
// utils and types

export { concatArrayBuffers, sliceArrayBufferAt } from '@src/functions.js'
export type { CompressionType, DictionarySize } from '@src/simple/types.js'
