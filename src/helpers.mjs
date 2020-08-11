import { curry } from '../node_modules/ramda/src/index.mjs'

const isBetween = curry((min, max, num) => {
  return num >= min && num <= max
})

const getLowestNBits = curry((numberOfBits, number) => {
  return number & ((1 << numberOfBits) - 1)
})

// Ramda.isEmpty not working with Buffers
// source: https://github.com/ramda/ramda/issues/2799
const isBufferEmpty = buffer => {
  return buffer.length === 0
}

export { isBetween, getLowestNBits, isBufferEmpty }
