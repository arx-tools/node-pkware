import { EOL } from 'os'
import fs from 'fs'
import assert from 'assert'

export const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

export const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}

export const readToBuffer = (fileName, chunkSizeInBytes = 1024) => {
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

// source: https://stackoverflow.com/a/43197340/1806628
export const isClass = obj => {
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

// https://stackoverflow.com/a/48845122/1806628
export const bufferToString = buffer => {
  const limit = 20
  const ellipsisNecessary = buffer.length > limit
  let hexString = buffer.slice(0, limit).toString('hex')
  hexString = hexString.length > 2 ? hexString.match(/../g).join(' ') : hexString
  return `<Buffer ${hexString}${ellipsisNecessary ? '...' : ''}>`
}

export const buffersShouldEqual = (expected, result) => {
  assert.ok(expected.equals(result), `${bufferToString(expected)} !== ${bufferToString(result)}`)
}
