const { Transform } = require('stream')
// import { promisify } from 'util'
const { promisify } = require('util')
const { isFunction } = require('ramda-adjunct')

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
    // let isLeftDone = false

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
    } else {
      // cntr ..... index ..... chunk.length
      left = chunk.slice(0, index - cntr)
      right = chunk.slice(index - cntr)
      // isLeftDone = true
    }

    cntr += chunk.length

    return [left, right /* , isLeftDone */]
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
  let hasHandler = false
  // let wasLeftFlushCalled = false

  return function (chunk, encoding, callback) {
    const [left, right /*, isLeftDone */] = predicate(chunk)

    if (isFirstChunk) {
      isFirstChunk = false
      this._flush = flushCallback => {
        // meg volt már hívva a leftHandler? ha nem, akkor itt az ideje
        if (isFunction(rightHandler._flush)) {
          hasHandler = true
          rightHandler._flush(flushCallback)
        }

        if (!hasHandler) {
          flushCallback(null, Buffer.from([]))
        }
      }
    }

    Promise.all([
      promisify(leftHandler).call(this, left, encoding),
      promisify(rightHandler).call(this, right, encoding)
    ])
      .then(buffers => {
        callback(null, Buffer.concat(buffers))
      })
      .catch(err => {
        callback(err)
      })
  }
}

module.exports = {
  splitAt,
  transformIdentity,
  transformEmpty,
  through,
  transformSplitBy
}
