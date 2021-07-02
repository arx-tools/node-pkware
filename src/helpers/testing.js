// const { EOL } = require('os')
// const fs = require('fs')
const assert = require('assert')
const { Writable } = require('stream')
const fs = require('fs')
const { compare, report } = require('binary-comparator')
const ExpandingBuffer = require('./ExpandingBuffer.js')

/*
const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
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

// source: https://stackoverflow.com/a/43197340/1806628
const isClass = obj => {
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
const bufferToString = (buffer, limit = 20) => {
  const ellipsisNecessary = buffer.length > limit
  let hexString = buffer.slice(0, limit).toString('hex')
  hexString = hexString.length > 2 ? hexString.match(/../g).join(' ') : hexString
  return `<Buffer ${hexString}${ellipsisNecessary ? '...' : ''}>`
}

const buffersShouldEqual = (expected, result, offset = 0, displayAsHex = false) => {
  if (!Buffer.isBuffer(expected)) {
    throw new Error('expected is not a Buffer')
  }
  const diff = report(expected, result, compare(expected, result, offset), displayAsHex)
  assert.ok(expected.equals(result), diff)
}

const streamToBuffer = done => {
  const buffer = new ExpandingBuffer()
  return new Writable({
    write(chunk, encoding, callback) {
      buffer.append(chunk)
      callback()
    },
    final(callback) {
      done(buffer.getHeap())
      callback()
    }
  })
}

const fileExists = async filename => {
  try {
    await fs.promises.access(filename, fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
}

module.exports = {
  isClass,
  buffersShouldEqual,
  bufferToString,
  streamToBuffer,
  fileExists
}
