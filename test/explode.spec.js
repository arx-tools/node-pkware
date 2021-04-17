/* global describe, it, before */

const assert = require('assert')
const { isFunction, isPlainObject } = require('ramda-adjunct')
const { ChBitsAsc, ChCodeAsc } = require('../src/constants.js')
const { InvalidDataError, InvalidCompressionTypeError, InvalidDictionarySizeError } = require('../src/errors.js')
const { explode, readHeader, generateAsciiTables, populateAsciiTable, createPATIterator } = require('../src/explode.js')

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
    it('contains 5 items', () => {
      assert.strictEqual(Object.keys(data).length, 5)
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
    it('contains the key "chBitsAsc", which is an array the same length as ChBitsAsc constant', () => {
      assert.ok(Array.isArray(data.chBitsAsc))
      assert.strictEqual(data.chBitsAsc.length, ChBitsAsc.length)
    })
    // TODO: more tests
  })
})

describe('createPATIterator', () => {
  it('is a function', () => {
    assert.ok(isFunction(createPATIterator), `${createPATIterator} is not a function`)
  })
  it('returns a function (iterator)', () => {
    const iterator = createPATIterator()
    assert.ok(isFunction(iterator), `${iterator} is not a function`)
  })
  it('takes a number (limit) and the iterator will return an array, when given seed is less, else it will return false', () => {
    const limit = 10
    const iterator = createPATIterator(limit)
    assert.strictEqual(iterator(11), false, `seed is larger, than the limit, expected iterator to return false`)
    assert.strictEqual(iterator(10), false, `seed is equal to the limit, expected iterator to return false`)
    assert.ok(Array.isArray(iterator(9)), `seed is less, than the limit, expected iterator to return an array`)
  })
  it('takes a second number (stepper) and the iterator will return the seed and seet + 1 << stepper in the array', () => {
    const limit = 20
    assert.deepStrictEqual(createPATIterator(limit, 2)(3), [3, 7])
    assert.deepStrictEqual(createPATIterator(limit, 3)(5), [5, 13])
  })
})

describe('populateAsciiTable', () => {
  it('is a function', () => {
    assert.ok(isFunction(populateAsciiTable), `${populateAsciiTable} is not a function`)
  })
  it('returns an array, which is shorter, than the number specified in the 4th parameter', () => {
    const result = populateAsciiTable(0x0b, 0, 0, 5)
    assert.ok(Array.isArray(result))
    assert.ok(result.length <= 5)
  })
  it('uses the 2nd number (index) to read seed value from ChCodeAsc for PATIterator and puts the 1st number into index positions it gave', () => {
    const index = 0x29
    assert.strictEqual(ChCodeAsc[index], 2, 'ChCodeAsc[index] should return 2, if not, then change index value')

    const result1 = []
    result1[2] = index
    result1[6] = index
    assert.deepStrictEqual(populateAsciiTable(2, index, 0, 10), result1)

    const result2 = []
    result2[2] = index
    result2[4] = index
    assert.deepStrictEqual(populateAsciiTable(1, index, 0, 5), result2)
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
  // TODO: more tests
})
