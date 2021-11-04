const { Transform, Writable } = require('stream')
const { promisify } = require('util')
const { isFunction } = require('ramda-adjunct')
const ExpandingBuffer = require('./ExpandingBuffer.js')

class QuasiTransform {
  constructor(handler) {
    this.handler = handler
  }

  handle(chunk, encoding) {
    return promisify(this.handler).call(this, chunk, encoding)
  }
}

const splitAt = index => {
  let cntr = 0

  if (!Number.isInteger(index) || index < 0) {
    return () => {
      return null
    }
  }

  return chunk => {
    let left
    let right
    let isLeftDone = true

    if (!Buffer.isBuffer(chunk)) {
      return null
    }

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = Buffer.from([])
      right = chunk
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = Buffer.from([])
      isLeftDone = index === cntr + chunk.length
    } else {
      // cntr ..... index ..... chunk.length
      left = chunk.slice(0, index - cntr)
      right = chunk.slice(index - cntr)
    }

    cntr += chunk.length

    return [left, right, isLeftDone]
  }
}

const transformIdentity = () => {
  return function (chunk, encoding, callback) {
    callback(null, chunk)
  }
}

const transformEmpty = () => {
  return function (chunk, encoding, callback) {
    callback(null, Buffer.from([]))
  }
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const transformSplitBy = (predicate, leftHandler, rightHandler) => {
  let isFirstChunk = true
  let wasLeftFlushCalled = false

  const leftTransform = new QuasiTransform(leftHandler)
  const rightTransform = new QuasiTransform(rightHandler)

  return function (chunk, encoding, callback) {
    const [left, right, isLeftDone] = predicate(chunk)

    const _left = leftTransform.handle(left, encoding)
    const _right = rightTransform.handle(right, encoding)

    if (isFirstChunk) {
      isFirstChunk = false
      this._flush = flushCallback => {
        let leftFiller = Promise.resolve(Buffer.from([]))
        let rightFiller = Promise.resolve(Buffer.from([]))

        if (!wasLeftFlushCalled && isFunction(leftTransform._flush)) {
          leftFiller = new Promise((resolve, reject) => {
            leftTransform._flush((err, data) => {
              if (err) {
                reject(err)
              } else {
                resolve(data)
              }
            })
          })
        }

        if (isFunction(rightTransform._flush)) {
          rightFiller = new Promise((resolve, reject) => {
            rightTransform._flush((err, data) => {
              if (err) {
                reject(err)
              } else {
                resolve(data)
              }
            })
          })
        }

        Promise.all([leftFiller, rightFiller])
          .then(buffers => {
            flushCallback(null, Buffer.concat(buffers))
          })
          .catch(err => {
            flushCallback(err)
          })
      }
    }

    let filler = Promise.resolve(Buffer.from([]))
    if (isLeftDone && !wasLeftFlushCalled && isFunction(leftTransform._flush)) {
      wasLeftFlushCalled = true
      filler = new Promise((resolve, reject) => {
        leftTransform._flush((err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      })
    }

    Promise.all([_left, filler, _right])
      .then(buffers => {
        callback(null, Buffer.concat(buffers))
      })
      .catch(err => {
        callback(err)
      })
  }
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

/*
export const splitAtMatch = (matches, skipBytes = 0, debug = false) => {
  let alreadyMatched = false
  const empty = Buffer.from([])

  return (chunk, offset) => {
    if (alreadyMatched) {
      return {
        left: empty,
        right: chunk
      }
    }

    const idxs = matches
      .map(bytes => chunk.indexOf(bytes))
      .filter(idx => idx > -1)
      .sort(subtract)
      .filter(idx => idx + offset >= skipBytes)

    if (idxs.length === 0) {
      return {
        left: empty,
        right: chunk
      }
    }

    alreadyMatched = true
    if (debug) {
      console.log(`found pkware header ${dumpBytes(chunk.slice(idxs[0], idxs[0] + 2))} at ${toHex(idxs[0])}`)
    }
    return splitAtIndex(idxs[0])(chunk, offset)
  }
}
*/

const outputInChunks = (buffer, stream) => {
  const chunks = Math.ceil(buffer.length / 1000)
  for (let i = 0; i < chunks - 1; i++) {
    stream.write(buffer.slice(i * 1000, (i + 1) * 1000))
  }
  stream.write(buffer.slice((chunks - 1) * 1000))
  stream.end()
}

module.exports = {
  splitAt,
  transformIdentity,
  transformEmpty,
  through,
  transformSplitBy,
  streamToBuffer,
  outputInChunks
}
