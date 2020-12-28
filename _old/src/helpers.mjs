// immutable functions

import { Transform } from 'stream'
import { promisify } from 'util'
import { subtract } from '../node_modules/ramda/src/index.mjs'

export const isBetween = (min, max, num) => {
  return num >= min && num <= max
}

export const nBitsOfOnes = numberOfBits => {
  return (1 << numberOfBits) - 1
}

export const getLowestNBits = (numberOfBits, number) => {
  return number & nBitsOfOnes(numberOfBits)
}

export const through = handler => {
  return new Transform({
    transform: handler
  })
}

export const transformSplitBy = (fn, handleLeft, handleRight) => {
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

export const splitAtIndex = splitAt => {
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

export const toHex = (num, bytes = 0, raw = false) => {
  return `${raw ? '' : '0x'}${num.toString(16).padStart(bytes, '0')}`
}

export const dumpBytes = bytes => {
  const formattedBytes = Array.from(bytes)
    .map(byte => toHex(byte, 2, true))
    .join(' ')
  return `<${formattedBytes}>`
}

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

export const transformIdentity = () => {
  return function (chunk, encoding, callback) {
    callback(null, chunk)
  }
}

export const transformEmpty = () => {
  return function (chunk, encoding, callback) {
    callback(null, Buffer.from([]))
  }
}

export const isNumeric = val => {
  return parseInt(val.trim()).toString() === val.trim()
}
