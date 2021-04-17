/* global describe, it */

const assert = require('assert')
const { isFunction, isPlainObject } = require('ramda-adjunct')
const { InvalidDataError } = require('../src/errors.js')
const { explode, readHeader } = require('../src/explode.js')

describe('readHeader', () => {
  it('is a function', () => {
    assert.ok(isFunction(readHeader), `${readHeader} is not a function`)
  })
  it('throws an error if given parameter is not a Buffer or no parameter is given at all', () => {
    assert.throws(() => {
      readHeader()
    })
    assert.throws(() => {
      readHeader(100.9)
    })
  })
  it('throws an InvalidDataError, when given Buffer is less, than 4 bytes', () => {
    assert.throws(() => {
      readHeader(Buffer.from([1, 2, 3]))
    }, InvalidDataError)
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
