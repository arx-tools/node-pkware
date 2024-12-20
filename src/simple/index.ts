import { type Buffer } from 'node:buffer'
import { Implode } from '@src/simple/Implode.js'

export function implode(
  input: Buffer,
  compressionType: 'ascii' | 'binary',
  dictionarySize: 'small' | 'medium' | 'large',
): Buffer {
  const instance = new Implode(compressionType, dictionarySize)
  return instance.handleData(input)
}

export { implode as compress }
