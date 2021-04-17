const { repeat } = require('ramda')
const { isNumber, isString } = require('ramda-adjunct')

const isBetween = (min, max, num) => {
  if (!isNumber(min) || !isNumber(max) || !isNumber(num)) {
    return null
  }
  if (min > max) {
    ;[min, max] = [max, min]
  }

  return num >= min && num <= max
}

const nBitsOfOnes = numberOfBits => {
  if (!Number.isInteger(numberOfBits) || numberOfBits < 0) {
    return null
  }
  return (1 << numberOfBits) - 1
}

const maskBits = (numberOfBits, number) => {
  const bits = nBitsOfOnes(numberOfBits)
  if (bits === null) {
    return null
  }
  if (!Number.isInteger(number) || number < 0) {
    return null
  }
  return number & nBitsOfOnes(numberOfBits)
}

const getLowestNBits = (numberOfBits, number) => {
  return number & nBitsOfOnes(numberOfBits)
}

const isFullHexString = str => {
  if (isString(str)) {
    return /^\s*0x[0-9a-f]+\s*$/.test(str)
  } else {
    return false
  }
}

const toHex = (num, digits = 0, withoutPrefix = false) => {
  const prefix = withoutPrefix ? '' : '0x'
  if (!Number.isInteger(digits) || digits < 0) {
    return null
  }
  if (isFullHexString(num)) {
    const number = num.trim().replace(/^0x0*/, '')
    return `${prefix}${number.padStart(digits, '0')}`
  }
  if (!Number.isInteger(num)) {
    return null
  }
  return `${prefix}${num.toString(16).padStart(digits, '0')}`
}

const mergeSparseArrays = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return []
  }

  const result = [...b, ...(b.length < a.length ? repeat(undefined, a.length - b.length) : [])]
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== undefined) {
      result[i] = a[i]
    }
  }
  return result
}

module.exports = {
  isBetween,
  nBitsOfOnes,
  maskBits,
  getLowestNBits,
  isFullHexString,
  toHex,
  mergeSparseArrays
}
