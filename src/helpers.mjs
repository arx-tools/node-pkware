import { Transform } from 'stream'
import { promisify } from 'util'
import { curry } from '../node_modules/ramda/src/index.mjs'

const isBetween = curry((min, max, num) => {
  return num >= min && num <= max
})

const nBitsOfOnes = numberOfBits => {
  return (1 << numberOfBits) - 1
}

const getLowestNBits = curry((numberOfBits, number) => {
  return number & nBitsOfOnes(numberOfBits)
})

const getLowestByte = getLowestNBits(8)

// Ramda.isEmpty not working with Buffers
// source: https://github.com/ramda/ramda/issues/2799
const isBufferEmpty = buffer => {
  return buffer.length === 0
}

const appendByteToBuffer = (byte, buffer) => {
  const nextByte = Buffer.alloc(1)
  nextByte.writeUInt8(byte, 0)
  return Buffer.concat([buffer, nextByte])
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const transformSplitByIdx = (splitAt, handleFirstPart, handleSecondPart) => {
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

const transformIdentity = () => {
  return function (chunk, encoding, callback) {
    callback(null, chunk)
  }
}

export {
  isBetween,
  nBitsOfOnes,
  getLowestNBits,
  getLowestByte,
  isBufferEmpty,
  appendByteToBuffer,
  through,
  transformSplitByIdx,
  transformIdentity
}
