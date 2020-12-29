const { isNumber } = require('ramda-adjunct')

const isBetween = (min, max, num) => {
  if (!isNumber(min) || !isNumber(max) || !isNumber(num)) {
    return null
  }
  return num >= min && num <= max
}

const nBitsOfOnes = numberOfBits => {
  return (1 << numberOfBits) - 1
}

const getLowestNBits = (numberOfBits, number) => {
  return number & nBitsOfOnes(numberOfBits)
}

const toHex = (num, bytes = 0, raw = false) => {
  return `${raw ? '' : '0x'}${num.toString(16).padStart(bytes, '0')}`
}

const dumpBytes = bytes => {
  const formattedBytes = Array.from(bytes)
    .map(byte => toHex(byte, 2, true))
    .join(' ')
  return `<${formattedBytes}>`
}

const isNumeric = val => {
  return parseInt(val.trim()).toString() === val.trim()
}

module.exports = {
  isBetween,
  nBitsOfOnes,
  getLowestNBits,
  toHex,
  dumpBytes,
  isNumeric
}
