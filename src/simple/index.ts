import { Explode } from '@src/simple/Explode.js'
import { Implode } from '@src/simple/Implode.js'

export function explode(input: ArrayBufferLike): ArrayBufferLike {
  const instance = new Explode()
  return instance.handleData(input)
}

export function implode(
  input: ArrayBufferLike,
  compressionType: 'ascii' | 'binary',
  dictionarySize: 'small' | 'medium' | 'large',
): ArrayBuffer {
  const instance = new Implode(input, compressionType, dictionarySize)
  return instance.outputBuffer
}

export { explode as decompress }
export { implode as compress }

// ---------------
// utils

export { concatArrayBuffers, sliceArrayBufferAt } from '@src/functions.js'
