/* global describe, it */

const assert = require('assert')
const {
  ERROR_INVALID_DICTIONARY_SIZE,
  ERROR_INVALID_COMPRESSION_TYPE,
  ERROR_INVALID_DATA,
  ERROR_ABORTED
} = require('../../src/constants.js')
const {
  InvalidDictionarySizeError,
  InvalidCompressionTypeError,
  InvalidDataError,
  AbortedError
} = require('../../src/errors.js')

describe('InvalidDictionarySizeError', () => {
  it('is an error', () => {
    assert.ok(InvalidDictionarySizeError.prototype instanceof Error)
  })
  it('contains ERROR_INVALID_DICTIONARY_SIZE as the message', () => {
    const e = new InvalidDictionarySizeError()
    assert.strictEqual(e.message, ERROR_INVALID_DICTIONARY_SIZE)
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidDictionarySizeError('hello!')
    assert.strictEqual(e.message, ERROR_INVALID_DICTIONARY_SIZE)
  })
})

describe('InvalidCompressionTypeError', () => {
  it('is an error', () => {
    assert.ok(InvalidCompressionTypeError.prototype instanceof Error)
  })
  it('contains ERROR_INVALID_COMPRESSION_TYPE as the message', () => {
    const e = new InvalidCompressionTypeError()
    assert.strictEqual(e.message, ERROR_INVALID_COMPRESSION_TYPE)
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidCompressionTypeError('hello!')
    assert.strictEqual(e.message, ERROR_INVALID_COMPRESSION_TYPE)
  })
})

describe('InvalidDataError', () => {
  it('is an error', () => {
    assert.ok(InvalidDataError.prototype instanceof Error)
  })
  it('contains ERROR_INVALID_DATA as the message', () => {
    const e = new InvalidDataError()
    assert.strictEqual(e.message, ERROR_INVALID_DATA)
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidDataError('hello!')
    assert.strictEqual(e.message, ERROR_INVALID_DATA)
  })
})

describe('AbortedError', () => {
  it('is an error', () => {
    assert.ok(AbortedError.prototype instanceof Error)
  })
  it('contains ERROR_ABORTED as the message', () => {
    const e = new AbortedError()
    assert.strictEqual(e.message, ERROR_ABORTED)
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new AbortedError('hello!')
    assert.strictEqual(e.message, ERROR_ABORTED)
  })
})
