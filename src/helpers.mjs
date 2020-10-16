// immutable functions

import { Transform } from 'stream'
import { promisify } from 'util'

export const isBetween = (min, max, num) => {
  return num >= min && num <= max
}

export const nBitsOfOnes = numberOfBits => {
  return (1 << numberOfBits) - 1
}

export const getLowestNBits = (numberOfBits, number) => {
  return number & nBitsOfOnes(numberOfBits)
}

// Ramda.isEmpty not working with Buffers
// source: https://github.com/ramda/ramda/issues/2799
export const isBufferEmpty = buffer => {
  return buffer.length === 0
}

export const appendByteToBuffer = (byte, buffer) => {
  const nextByte = Buffer.alloc(1)
  nextByte.writeUInt8(byte, 0)
  return Buffer.concat([buffer, nextByte])
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
