const {
  ERROR_INVALID_DICTIONARY_SIZE,
  ERROR_INVALID_COMPRESSION_TYPE,
  ERROR_INVALID_DATA,
  ERROR_ABORTED
} = require('./constants.js')

class InvalidDictionarySizeError extends Error {
  constructor() {
    super(ERROR_INVALID_DICTIONARY_SIZE)
    this.name = 'InvalidDictionarySizeError'
  }
}

class InvalidCompressionTypeError extends Error {
  constructor() {
    super(ERROR_INVALID_COMPRESSION_TYPE)
    this.name = 'InvalidCompressionTypeError'
  }
}

class InvalidDataError extends Error {
  constructor() {
    super(ERROR_INVALID_DATA)
    this.name = 'InvalidDataError'
  }
}

class AbortedError extends Error {
  constructor() {
    super(ERROR_ABORTED)
    this.name = 'AbortedError'
  }
}

module.exports = {
  InvalidDictionarySizeError,
  InvalidCompressionTypeError,
  InvalidDataError,
  AbortedError
}
