const { Transform, Writable } = require('stream')
const { promisify } = require('util')
const { ExpandingBuffer } = require('./ExpandingBuffer')
const { isFunction } = require('./functions')

const emptyBuffer = Buffer.from([])

class QuasiTransform {
  constructor(handler) {
    this.handler = handler
  }

  handle(chunk, encoding) {
    return promisify(this.handler).call(this, chunk, encoding)
  }
}

const splitAt = (index) => {
  let cntr = 0

  if (!Number.isInteger(index) || index < 0) {
    return () => {
      return null
    }
  }

  return (chunk) => {
    let left
    let right
    let isLeftDone = true

    if (!Buffer.isBuffer(chunk)) {
      return null
    }

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = emptyBuffer
      right = chunk
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = emptyBuffer
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
    callback(null, emptyBuffer)
  }
}

const through = (handler) => {
  return new Transform({
    transform: handler,
  })
}

const transformSplitBy = (predicate, leftHandler, rightHandler) => {
  let isFirstChunk = true
  let wasLeftFlushCalled = false
  const damChunkSize = 0x10000
  const dam = new ExpandingBuffer()

  const leftTransform = new QuasiTransform(leftHandler)
  const rightTransform = new QuasiTransform(rightHandler)

  return function (chunk, encoding, callback) {
    const [left, right, isLeftDone] = predicate(chunk)

    const _left = leftTransform.handle(left, encoding)
    const _right = rightTransform.handle(right, encoding)

    if (isFirstChunk) {
      isFirstChunk = false
      this._flush = (flushCallback) => {
        if (!dam.isEmpty()) {
          this.push(dam.read())
        }

        let leftFiller = Promise.resolve(emptyBuffer)
        let rightFiller = Promise.resolve(emptyBuffer)

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
          .then((buffers) => {
            flushCallback(null, Buffer.concat(buffers))
          })
          .catch((err) => {
            flushCallback(err)
          })
      }
    }

    let filler = Promise.resolve(emptyBuffer)
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
      .then((buffers) => {
        dam.append(Buffer.concat(buffers))
        if (dam.size() > damChunkSize) {
          const chunks = Math.floor(dam.size() / damChunkSize)
          const data = Buffer.from(dam.read(0, chunks * damChunkSize))
          dam.flushStart(chunks * damChunkSize)
          for (let i = 0; i < chunks - 1; i++) {
            this.push(data.slice(i * damChunkSize, i * damChunkSize + damChunkSize))
          }
          callback(null, data.slice((chunks - 1) * damChunkSize))
        } else {
          callback(null, emptyBuffer)
        }
      })
      .catch((err) => {
        callback(err)
      })
  }
}

const streamToBuffer = (done) => {
  const buffer = new ExpandingBuffer()
  return new Writable({
    write(chunk, encoding, callback) {
      buffer.append(chunk)
      callback()
    },
    final(callback) {
      done(buffer.getHeap())
      callback()
    },
  })
}

module.exports = {
  splitAt,
  transformIdentity,
  transformEmpty,
  through,
  transformSplitBy,
  streamToBuffer,
}
