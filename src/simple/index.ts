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
): ArrayBufferLike {
  const instance = new Implode(compressionType, dictionarySize)
  return instance.handleData(input)
}

export { explode as decompress }
export { implode as compress }
