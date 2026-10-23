import type { CompressionType, DictionarySize } from '../types.ts'
import { Explode } from './Explode.ts'
import { Implode } from './Implode.ts'

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

export { concatArrayBuffersAndLengthedDatas as concatArrayBuffers, sliceArrayBufferAt } from '../functions.ts'
export type { CompressionType, DictionarySize } from '../types.ts'
