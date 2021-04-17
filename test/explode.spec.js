/* global describe, it */

const assert = require('assert')
const { isFunction, isPlainObject } = require('ramda-adjunct')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('../src/errors.js')
const { explode, readHeader } = require('../src/explode.js')

describe('readHeader', () => {
  it('is a function', () => {
    assert.ok(isFunction(readHeader), `${readHeader} is not a function`)
  })
  it('throws an InvalidDataError if given parameter is not a Buffer or no parameter is given at all', () => {
    assert.throws(() => {
      readHeader()
    }, InvalidDataError)
    assert.throws(() => {
      readHeader(100.9)
    }, InvalidDataError)
    assert.throws(() => {
      readHeader([1, 2, 3, 4, 5])
    }, InvalidDataError)
  })
  it('throws an InvalidDataError, when given Buffer is less, than 4 bytes', () => {
    assert.throws(() => {
      readHeader(Buffer.from([1, 2, 3]))
    }, InvalidDataError)
  })
  it('throws an InvalidCompressionTypeError, when first byte of given Buffer is neither 0, nor 1', () => {
    assert.throws(() => {
      readHeader(Buffer.from([7, 1, 2, 3]))
    }, InvalidCompressionTypeError)
  })
  it('throws an InvalidDictionarySizeError, when second byte of given Buffer is not between 4 and 6', () => {
    assert.throws(() => {
      readHeader(Buffer.from([1, 9, 2, 3]))
    }, InvalidDictionarySizeError)
  })
  it('returns an object', () => {
    const state = readHeader(Buffer.from([0x00, 0x04, 0x86, 0xbc]))
    assert.ok(isPlainObject(state), `${state} is not an object`)
  })
  it('loads the bytes of the Buffer to the state ', () => {
    const state = readHeader(Buffer.from([0x00, 0x04, 0x86, 0xbc]))
    assert.strictEqual(state.compressionType, 0x00)
    assert.strictEqual(state.dictionarySizeBits, 0x04)
  })
})

describe('explode', () => {
  it('is a function', () => {
    assert.ok(isFunction(explode), `${explode} is not a function`)
  })
  it('returns a function when called', () => {
    const handler = explode()
    assert.ok(isFunction(handler), `${handler} is not a function`)
  })
  describe('returned handler', () => {
    it('has a _state variable, which is an object', () => {
      const handler = explode()
      assert.ok(isPlainObject(handler._state), `${handler._state} is not an object`)
    })
  })
})
