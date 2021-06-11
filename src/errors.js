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

module.exports = {
  InvalidDictionarySizeError,
  InvalidCompressionTypeError,
  InvalidDataError,
  AbortedError
}
