import { type Buffer } from 'node:buffer'
import { Explode } from '@src/simple/Explode.js'
import { Implode } from '@src/simple/Implode.js'

export function explode(input: Buffer): Buffer {
  const instance = new Explode()
  return instance.handleData(input)
}

export function implode(
  input: Buffer,
  compressionType: 'ascii' | 'binary',
  dictionarySize: 'small' | 'medium' | 'large',
): Buffer {
  const instance = new Implode(compressionType, dictionarySize)
  return instance.handleData(input)
}

export { explode as decompress }
export { implode as compress }
