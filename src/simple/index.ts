import { Explode } from '@src/simple/Explode.js'
import { Implode } from '@src/simple/Implode.js'

export function explode(input: ArrayBuffer): ArrayBuffer {
  const instance = new Explode()
  return instance.handleData(input)
}

export function implode(
  input: ArrayBuffer,
  compressionType: 'ascii' | 'binary',
  dictionarySize: 'small' | 'medium' | 'large',
): ArrayBuffer {
  const instance = new Implode(compressionType, dictionarySize)
  return instance.handleData(input)
}

export { explode as decompress }
export { implode as compress }
