/* global describe, it */

const assert = require('assert')
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
  it('contains "Invalid dictionary size" as the message', () => {
    const e = new InvalidDictionarySizeError()
    assert.strictEqual(e.message, 'Invalid dictionary size')
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidDictionarySizeError('hello!')
    assert.strictEqual(e.message, 'Invalid dictionary size')
  })
})

describe('InvalidCompressionTypeError', () => {
  it('is an error', () => {
    assert.ok(InvalidCompressionTypeError.prototype instanceof Error)
  })
  it('contains "Invalid compression type" as the message', () => {
    const e = new InvalidCompressionTypeError()
    assert.strictEqual(e.message, 'Invalid compression type')
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidCompressionTypeError('hello!')
    assert.strictEqual(e.message, 'Invalid compression type')
  })
})

describe('InvalidDataError', () => {
  it('is an error', () => {
    assert.ok(InvalidDataError.prototype instanceof Error)
  })
  it('contains "Invalid data" as the message', () => {
    const e = new InvalidDataError()
    assert.strictEqual(e.message, 'Invalid data')
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new InvalidDataError('hello!')
    assert.strictEqual(e.message, 'Invalid data')
  })
})

describe('AbortedError', () => {
  it('is an error', () => {
    assert.ok(AbortedError.prototype instanceof Error)
  })
  it('contains "Aborted" as the message', () => {
    const e = new AbortedError()
    assert.strictEqual(e.message, 'Aborted')
  })
  it('does not change the message, when created with a string specified', () => {
    const e = new AbortedError('hello!')
    assert.strictEqual(e.message, 'Aborted')
  })
})
