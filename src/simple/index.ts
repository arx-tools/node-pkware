import { Explode } from '@src/simple/Explode.js'
import { Implode } from '@src/simple/Implode.js'
import { type CompressionType, type DictionarySize } from '@src/simple/types.js'

export function explode(input: ArrayBufferLike): ArrayBufferLike {
  const instance = new Explode()
  return instance.handleData(input)
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

// ---------------
// utils

export { concatArrayBuffers, sliceArrayBufferAt } from '@src/functions.js'
