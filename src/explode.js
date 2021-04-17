const { repeat } = require('ramda')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('./errors.js')
const { isBetween } = require('./helpers/functions.js')

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

const generateAsciiTables = () => {
  return {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100)
  }
}

const explode = () => {
  const fn = () => {}

  fn._state = {}

  return fn
}

module.exports = {
  readHeader,
  explode,
  generateAsciiTables
}
