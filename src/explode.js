const { repeat, unfold, reduce } = require('ramda')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('./errors.js')
const { isBetween, mergeSparseArrays, getLowestNBits } = require('./helpers/functions.js')
const { ChBitsAsc, ChCodeAsc } = require('./constants.js')
const ExpandingBuffer = require('./helpers/ExpandingBuffer.js')

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
  const tables = {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100)
  }

  tables.chBitsAsc = ChBitsAsc.map((value, index) => {
    if (value <= 8) {
      tables.asciiTable2C34 = mergeSparseArrays(populateAsciiTable(value, index, 0, 0x100), tables.asciiTable2C34)
      return value - 0
    }

    const acc = getLowestNBits(8, ChCodeAsc[index])
    if (acc === 0) {
      tables.asciiTable2EB4 = mergeSparseArrays(populateAsciiTable(value, index, 8, 0x100), tables.asciiTable2EB4)
      return value - 8
    }

    tables.asciiTable2C34[acc] = 0xff

    if (getLowestNBits(6, ChCodeAsc[index]) === 0) {
      tables.asciiTable2E34 = mergeSparseArrays(populateAsciiTable(value, index, 6, 0x80), tables.asciiTable2E34)
      return value - 6
    }

    tables.asciiTable2D34 = mergeSparseArrays(populateAsciiTable(value, index, 4, 0x100), tables.asciiTable2D34)
    return value - 4
  })

  return tables
}

const parseFirstChunk = () => {}

const explode = () => {
  const handler = (chunk, encoding, callback) => {
    const state = handler._state
    state.needMoreInput = false
    try {
      state.inputBuffer.append(chunk)
    } catch (e) {
      callback(e)
    }
  }

  handler._state = {
    needMoreInput: false,
    isFirstChunk: true,
    inputBuffer: new ExpandingBuffer(),
    outputBuffer: new ExpandingBuffer()
  }

  return handler
}

module.exports = {
  readHeader,
  explode,
  createPATIterator,
  populateAsciiTable,
  generateAsciiTables,
  parseFirstChunk
}
