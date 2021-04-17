const { repeat, clone, unfold, reduce } = require('ramda')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('./errors.js')
const { isBetween } = require('./helpers/functions.js')
const { ChBitsAsc, ChCodeAsc } = require('./constants.js')

const readHeader = buffer => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new InvalidDataError()
  }
  if (buffer.readUInt8(0) !== 0 && buffer.readUInt8(0) !== 1) {
    throw new InvalidCompressionTypeError()
  }
  if (!isBetween(4, 6, buffer.readUInt8(1))) {
    throw new InvalidDictionarySizeError()
  }

  return {
    compressionType: buffer.readUInt8(0),
    dictionarySizeBits: buffer.readUInt8(1)
  }
}

// PAT = populate ascii table
const createPATIterator = (limit, stepper) => n => {
  return n >= limit ? false : [n, n + (1 << stepper)]
}

const populateAsciiTable = (value, index, bits, limit) => {
  const iterator = createPATIterator(limit, value - bits)
  const seed = ChCodeAsc[index] >> bits
  const idxs = unfold(iterator, seed)

  return reduce(
    (acc, idx) => {
      acc[idx] = index
      return acc
    },
    [],
    idxs
  )
}

const generateAsciiTables = () => {
  const state = {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100),
    chBitsAsc: clone(ChBitsAsc)
  }

  return state
}

const explode = () => {
  const fn = () => {}

  fn._state = {}

  return fn
}

module.exports = {
  readHeader,
  explode,
  createPATIterator,
  populateAsciiTable,
  generateAsciiTables
}
