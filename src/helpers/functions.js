const fs = require('fs')
const { repeat, test, type } = require('ramda')

const isNumber = (x) => {
  return typeof x === 'number'
}

const isString = (x) => {
  return typeof x === 'string'
}

const isFunction = (x) => {
  return type(x) === 'Function'
}

const noop = () => {}

// https://stackoverflow.com/a/68989785/1806628
const isPlainObject = (x) => {
  return x.constructor === Object
}

const isBetween = (min, max, num) => {
  if (!isNumber(min) || !isNumber(max) || !isNumber(num)) {
    return null
  }
  if (min > max) {
    ;[min, max] = [max, min]
  }

  return num >= min && num <= max
}

const nBitsOfOnes = (numberOfBits) => {
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

const isDecimalString = test(/^\d+$/)

const isFullHexString = (str) => {
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

/*
export const dumpBytes = bytes => {
  const formattedBytes = Array.from(bytes)
    .map(byte => toHex(byte, 2, true))
    .join(' ')
  return `<${formattedBytes}>`
}
*/

const parseNumberString = (n, defaultValue = 0) => {
  if (isDecimalString(n)) {
    return parseInt(n)
  } else if (isFullHexString(n)) {
    return parseInt(n.replace(/^0x/, ''), 16)
  } else {
    return defaultValue
  }
}

const getPackageVersion = async () => {
  try {
    const { version } = require('../../package.json')
    return version
  } catch (error) {
    return 'unknown'
  }
}

const fileExists = async (filename) => {
  try {
    await fs.promises.access(filename, fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
}

module.exports = {
  isNumber,
  isString,
  isFunction,
  noop,
  isPlainObject,
  isBetween,
  nBitsOfOnes,
  maskBits,
  getLowestNBits,
  isFullHexString,
  toHex,
  mergeSparseArrays,
  parseNumberString,
  getPackageVersion,
  fileExists,
}
