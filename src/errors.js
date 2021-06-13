class InvalidDictionarySizeError extends Error {
  constructor() {
    super('Invalid dictionary size')
    this.name = 'InvalidDictionarySizeError'
  }
}

class InvalidCompressionTypeError extends Error {
  constructor() {
    super('Invalid compression type')
    this.name = 'InvalidCompressionTypeError'
  }
}

class InvalidDataError extends Error {
  constructor() {
    super('Invalid data')
    this.name = 'InvalidDataError'
  }
}

class AbortedError extends Error {
  constructor() {
    super('Aborted')
    this.name = 'AbortedError'
  }
}

class ExpectedBufferError extends TypeError {
  constructor() {
    super('Expected variable to be of type Buffer')
    this.name = 'ExpectedBufferError'
  }
}

module.exports = {
  InvalidDictionarySizeError,
  InvalidCompressionTypeError,
  InvalidDataError,
  AbortedError,
  ExpectedBufferError
}
