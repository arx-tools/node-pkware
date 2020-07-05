import { curry } from '../node_modules/ramda/src/index.mjs'

const isBetween = curry((min, max, num) => {
  return num >= min && num <= max
})

const getLowestNBits = curry((numberOfBits, number) => {
  return number & ((1 << numberOfBits) - 1)
})

export { isBetween, getLowestNBits }
