/* global describe, it, before */

const assert = require('assert')
const { isFunction, isPlainObject } = require('ramda-adjunct')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('../src/errors.js')
const { explode, readHeader, generateAsciiTables } = require('../src/explode.js')

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
    const data = readHeader(Buffer.from([0x00, 0x04, 0x86, 0xbc]))
    assert.ok(isPlainObject(data), `${data} is not an object`)
  })
  it('loads the bytes of the Buffer to the returned object ', () => {
    const data = readHeader(Buffer.from([0x00, 0x04, 0x86, 0xbc]))
    assert.strictEqual(data.compressionType, 0x00)
    assert.strictEqual(data.dictionarySizeBits, 0x04)
  })
  it('only returns compressionType and dictionarySizeBits in the returned object', () => {
    const keys = Object.keys(readHeader(Buffer.from([0x00, 0x04, 0x86, 0xbc])))
    assert.strictEqual(keys.length, 2)
  })
})

describe('generateAsciiTables', () => {
  it('is a function', () => {
    assert.ok(isFunction(generateAsciiTables), `${generateAsciiTables} is not a function`)
  })
  it('returns an object', () => {
    const data = generateAsciiTables()
    assert.ok(generateAsciiTables(data), `${data} is not an object`)
  })
  describe('returned object', () => {
    let data
    before(() => {
      data = generateAsciiTables()
    })
    it('contains 4 items', () => {
      const keys = Object.keys(data)
      assert.strictEqual(keys.length, 4)
    })
    it('contains the key "asciiTable2C34", which is an array of 0x100 length', () => {
      assert.ok(Array.isArray(data.asciiTable2C34))
      assert.strictEqual(data.asciiTable2C34.length, 0x100)
    })
    it('contains the key "asciiTable2D34", which is an array of 0x100 length', () => {
      assert.ok(Array.isArray(data.asciiTable2D34))
      assert.strictEqual(data.asciiTable2D34.length, 0x100)
    })
    it('contains the key "asciiTable2E34", which is an array of 0x100 length', () => {
      assert.ok(Array.isArray(data.asciiTable2E34))
      assert.strictEqual(data.asciiTable2E34.length, 0x80)
    })
    it('contains the key "asciiTable2EB4", which is an array of 0x100 length', () => {
      assert.ok(Array.isArray(data.asciiTable2EB4))
      assert.strictEqual(data.asciiTable2EB4.length, 0x100)
    })
  })
  // TODO: how to do more tests on the results?
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
  // TODO: more tests
})
