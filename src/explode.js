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

const explode = () => {
  const fn = () => {}

  fn._state = {}

  return fn
}

module.exports = {
  readHeader,
  explode
}
