// immutable functions

import { Transform } from 'stream'
import { promisify } from 'util'
import { reduce, toPairs, curry } from '../node_modules/ramda/src/index.mjs'

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

export const transformSplitByIdx = (splitAt, handleFirstPart, handleSecondPart) => {
  let idx = 0

  return function (chunk, encoding, callback) {
    if (idx + chunk.length <= splitAt) {
      handleFirstPart.call(this, chunk, encoding, callback)
    } else if (idx > splitAt) {
      handleSecondPart.call(this, chunk, encoding, callback)
    } else {
      const firstPart = chunk.slice(0, splitAt - idx)
      const secondPart = chunk.slice(splitAt - idx)

      Promise.all([
        promisify(handleFirstPart).call(this, firstPart, encoding),
        promisify(handleSecondPart).call(this, secondPart, encoding)
      ])
        .then(buffers => {
          callback(null, Buffer.concat(buffers))
        })
        .catch(err => {
          callback(err)
        })
    }
    idx = idx + chunk.length
  }
}

export const transformIdentity = () => {
  return function (chunk, encoding, callback) {
    callback(null, chunk)
  }
}

export const toHex = (num, bytes = 0) => {
  return `0x${num.toString(16).padStart(bytes, '0')}`
}

export const transformEmpty = () => {
  return function (chunk, encoding, callback) {
    callback(null, Buffer.from([]))
  }
}

export const isNumeric = val => {
  return parseInt(val.trim()).toString() === val.trim()
}

// projectOver([0, 0, 0, 0, 0], {"3":20, "1":10}) -> [0, 10, 0, 20, 0]
export const projectOver = curry((arr, obj) => {
  return reduce(
    (acc, [key, value]) => {
      if (isNumeric(key)) {
        acc[key] = value
      }
      return acc
    },
    arr,
    toPairs(obj)
  )
})
