// import { EOL } from 'node:os'

import { Handler } from './types'

// import fs from 'node:fs'
import assert from 'node:assert'
import { compare, report } from 'binary-comparator'

/*
const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

const toConsole = () => {
  return (chunk, encoding, callback) => {
    process.stdout.write(chunk)
    process.stdout.write(Buffer.from(EOL))
    callback(null, chunk)
  }
}

const readToBuffer = (fileName, chunkSizeInBytes = 1024) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    fs.createReadStream(fileName, { highWaterMark: chunkSizeInBytes })
      .on('error', reject)
      .on('data', chunk => {
        chunks.push(chunk)
      })
      .on('end', function () {
        resolve(Buffer.concat(chunks))
      })
  })
}
*/

/**
 * @see https://stackoverflow.com/a/43197340/1806628
 */
export const isClass = (obj: any): obj is object => {
  const isCtorClass = obj.constructor && obj.constructor.toString().substring(0, 5) === 'class'

  if (obj.prototype === undefined) {
    return isCtorClass
  }

  const isPrototypeCtorClass =
    obj.prototype.constructor &&
    obj.prototype.constructor.toString &&
    obj.prototype.constructor.toString().substring(0, 5) === 'class'

  return isCtorClass || isPrototypeCtorClass
}

/**
 * @see https://stackoverflow.com/a/48845122/1806628
 */
export const bufferToString = (buffer: Buffer, limit: number = 20) => {
  const isEllipsisNecessary = buffer.length > limit

  let hexString = buffer.subarray(0, limit).toString('hex')
  hexString = hexString.length > 2 ? hexString.match(/../g).join(' ') : hexString

  return `<Buffer ${hexString}${isEllipsisNecessary ? '...' : ''}>`
}

export const buffersShouldEqual = (
  expected: Buffer,
  result: Buffer,
  offset: number = 0,
  displayAsHex: boolean = false,
) => {
  if (!Buffer.isBuffer(expected)) {
    throw new Error('expected is not a Buffer')
  }

  if (!Buffer.isBuffer(result)) {
    throw new Error('result is not a Buffer')
  }

  const diff = report(expected, result, compare(expected, result, offset), displayAsHex)

  assert.ok(expected.equals(result), diff)
}

export const transformToABC = () => {
  let cntr = 0

  return function (chunk, encoding, callback) {
    callback(null, Buffer.from([65 + (cntr++ % 26)]))
  } as Handler
}
