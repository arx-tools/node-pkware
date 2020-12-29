const { Transform } = require('stream')
const { promisify } = require('util')
const { subtract } = require('ramda')
const { toHex, dumpBytes } = require('./src.js')

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const transformSplitBy = (fn, handleLeft, handleRight) => {
  let idx = 0

  return function (chunk, encoding, callback) {
    const { left, right } = fn(chunk, idx)

    idx = idx + chunk.length

    Promise.all([promisify(handleLeft).call(this, left, encoding), promisify(handleRight).call(this, right, encoding)])
      .then(buffers => {
        callback(null, Buffer.concat(buffers))
      })
      .catch(err => {
        callback(err)
      })
  }
}

const splitAtIndex = splitAt => {
  const empty = Buffer.from([])

  return (chunk, offset) => {
    if (offset + chunk.length <= splitAt) {
      return {
        left: chunk,
        right: empty
      }
    }

    if (offset > splitAt) {
      return {
        left: empty,
        right: chunk
      }
    }

    return {
      left: chunk.slice(0, splitAt - offset),
      right: chunk.slice(splitAt - offset)
    }
  }
}

const splitAtMatch = (matches, skipBytes = 0, debug = false) => {
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

module.exports = {
  through,
  transformSplitBy,
  splitAtIndex,
  splitAtMatch,
  transformIdentity,
  transformEmpty
}
