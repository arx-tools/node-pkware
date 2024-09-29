/**
 * Thrown by
 * - `implode` when invalid dictionary size was specified
 * - `explode` when it encounters invalid data in the header section (the first 2 bytes of a compressed files)
 */
export class InvalidDictionarySizeError extends Error {
  constructor() {
    super('Invalid dictionary size')
    this.name = 'InvalidDictionarySizeError'
  }
}

/**
 * Thrown by
 * - `implode` when invalid compression type was specified
 * - `explode` when it encounters invalid data in the header section (the first 2 bytes of a compressed files)
 */
export class InvalidCompressionTypeError extends Error {
  constructor() {
    super('Invalid compression type')
    this.name = 'InvalidCompressionTypeError'
  }
}

/**
 * Thrown by
 * - `explode` when compressed data ends without reaching the end literal or in mid decompression
 */
export class AbortedError extends Error {
  constructor() {
    super('Aborted')
    this.name = 'AbortedError'
  }
}
