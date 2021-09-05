const assert = require('assert')
const { Readable } = require('stream')
const { describe, it, before, beforeEach } = require('mocha')
// const { has } = require('ramda')
const { isFunction, isPlainObject, noop } = require('ramda-adjunct')
const { ChBitsAsc, ChCodeAsc /*, COMPRESSION_ASCII, COMPRESSION_BINARY */ } = require('../src/constants.js')
const {
  InvalidDataError,
  InvalidCompressionTypeError,
  InvalidDictionarySizeError,
  ExpectedBufferError,
  ExpectedFunctionError
} = require('../src/errors.js')
const {
  explode,
  readHeader,
  generateAsciiTables,
  populateAsciiTable,
  createPATIterator,
  processChunkData,
  wasteBits,
  decodeNextLiteral,
  decodeDistance,
  generateDecodeTables
} = require('../src/explode.js')
const ExpandingBuffer = require('../src/helpers/ExpandingBuffer.js')
const { through } = require('../src/helpers/stream.js')
const { buffersShouldEqual } = require('../src/helpers/testing.js')

describe('readHeader', () => {
  it('is a function', () => {
    assert.ok(isFunction(readHeader), `${readHeader} is not a function`)
  })
  it('expects first parameter to be a buffer', () => {
    assert.throws(() => {
      readHeader(123)
    }, ExpectedBufferError)
    assert.throws(() => {
      readHeader()
    }, ExpectedBufferError)
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
    it('contains the key "asciiTable2E34", which is an array of 0x80 length', () => {
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
    // TODO: more tests once it's understand what the generated data is
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

  // TODO: more tests for the 3rd param
  // + if value < bits -> []
  // + if ChCodeAsc[index] > limit -> []
})

describe('wasteBits', () => {
  it('is a function', () => {
    assert.ok(isFunction(wasteBits), `${wasteBits} is not a function`)
  })

  // TODO: create tests
})

describe('decodeNextLiteral', () => {
  it('is a function', () => {
    assert.ok(isFunction(decodeNextLiteral), `${decodeNextLiteral} is not a function`)
  })

  // TODO: create tests
})

describe('generateDecodeTables', () => {
  it('is a function', () => {
    assert.ok(isFunction(generateDecodeTables), `${generateDecodeTables} is not a function`)
  })

  // TODO: create tests
})

describe('decodeDistance', () => {
  it('is a function', () => {
    assert.ok(isFunction(decodeDistance), `${decodeDistance} is not a function`)
  })

  // TODO: create tests
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
    let handler
    beforeEach(() => {
      handler = explode()
    })
    it('has a _state variable, which is an object', () => {
      assert.ok(isPlainObject(handler._state), `${handler._state} is not an object`)
    })

    describe('_state', () => {
      let state
      beforeEach(() => {
        state = explode()._state
      })
      it('has an needMoreInput key, which is true by default', () => {
        assert.strictEqual(state.needMoreInput, true)
      })
      it('has an isFirstChunk key, which is true by default', () => {
        assert.strictEqual(state.isFirstChunk, true)
      })
      it('has an inputBuffer key, which is an ExpandingBuffer', () => {
        assert.ok(state.inputBuffer instanceof ExpandingBuffer)
      })
      it('has an outputBuffer key, which is an ExpandingBuffer', () => {
        assert.ok(state.outputBuffer instanceof ExpandingBuffer)
      })
      it('has an onOutputFinished key, which is a function', () => {
        assert.ok(isFunction(state.onInputFinished))
      })
    })

    it('expects 3rd parameter to be a function', () => {
      assert.throws(() => {
        handler(Buffer.from([]))
      }, ExpectedFunctionError)
    })
    it('gives an errorous callback when the first parameter is not a buffer', done => {
      handler(12, null, err => {
        assert.ok(err instanceof Error)
        done()
      })
    })
    it('resets state.needMoreInput to true when first called', () => {
      handler._state.needMoreInput = 'xxx4'
      handler(Buffer.from([]), null, noop)
      assert.strictEqual(handler._state.needMoreInput, true)
    })
    it('appends the chunk given as the first parameter to state.inputBuffer', () => {
      handler(Buffer.from([1, 2, 3]), null, noop)
      buffersShouldEqual(handler._state.inputBuffer.getHeap(), Buffer.from([1, 2, 3]))
      handler(Buffer.from([4, 5, 6]), null, noop)
      buffersShouldEqual(handler._state.inputBuffer.getHeap(), Buffer.from([1, 2, 3, 4, 5, 6]))
    })
    it('sets state.isFirstChunk to false after the first call', () => {
      handler(Buffer.from([1, 2, 3]), null, noop)
      assert.strictEqual(handler._state.isFirstChunk, false)
    })
    it('calling the handler via streams will call state.onInputFinished once the stream have finished', done => {
      let wasCalled = false
      handler._state.onInputFinished = () => {
        wasCalled = true
      }
      const checkIfWasCalled = () => {
        if (wasCalled) {
          done()
        }
      }
      Readable.from('123')
        .pipe(through(handler).on('error', checkIfWasCalled))
        .on('finish', checkIfWasCalled)
        .on('error', checkIfWasCalled)
    })
  })

  describe('processChunkData', () => {
    it('is a function', () => {
      assert.ok(isFunction(processChunkData), `${processChunkData} is not a function`)
    })
    /*
    it('gets a state object and if state.inputBuffer is big enough, then reads header data', () => {
      const state = {
        inputBuffer: new ExpandingBuffer()
      }
      state.inputBuffer.append(Buffer.from([1, 4, 0, 0]))
      processChunkData(state)
      assert.strictEqual(state.compressionType, 1)
      assert.strictEqual(state.dictionarySizeBits, 4)
    })
    */
    it('leaves state unchanged, when header is not read yet and we have less, than 4 bytes', () => {
      const state = {
        inputBuffer: new ExpandingBuffer()
      }
      state.inputBuffer.append(Buffer.from([1, 4, 0]))
      processChunkData(state)
      assert.strictEqual(Object.keys(state).length, 1)
      assert.strictEqual(state.inputBuffer.size(), 3)
    })
    /*
    it('sets state.bitBuffer to the 3rd byte of inputBuffer, when reading header data', () => {
      const state = {
        inputBuffer: new ExpandingBuffer()
      }
      state.inputBuffer.append(Buffer.from([1, 4, 52, 5]))
      processChunkData(state)
      assert.strictEqual(state.bitBuffer, 52)
    })
    */
    /*
    it('trims off the first 3 bytes from the inputBuffer once the header is read', () => {
      const state = {
        inputBuffer: new ExpandingBuffer()
      }
      state.inputBuffer.append(Buffer.from([0, 5, 102, 49, 7]))
      processChunkData(state)
      buffersShouldEqual(Buffer.from([49, 7]), state.inputBuffer.read())
    })
    */
    /*
    it('sets state.dictionarySizeMask when reading header data', () => {
      const state1 = {
        inputBuffer: new ExpandingBuffer()
      }
      state1.inputBuffer.append(Buffer.from([0, 5, 102, 4]))
      processChunkData(state1)
      assert.strictEqual(state1.dictionarySizeMask, 0b11111)

      const state2 = {
        inputBuffer: new ExpandingBuffer()
      }
      state2.inputBuffer.append(Buffer.from([1, 6, 71, 4]))
      processChunkData(state2)
      assert.strictEqual(state2.dictionarySizeMask, 0b111111)
    })
    */
    /*
    it('adds generated ascii tables to state, when compression type is ascii', () => {
      const state1 = {
        inputBuffer: new ExpandingBuffer()
      }
      state1.inputBuffer.append(Buffer.from([COMPRESSION_ASCII, 4, 5, 6]))
      processChunkData(state1)
      assert.ok(has('asciiTable2E34', state1))

      const state2 = {
        inputBuffer: new ExpandingBuffer()
      }
      state2.inputBuffer.append(Buffer.from([COMPRESSION_BINARY, 4, 5, 6]))
      processChunkData(state2)
      assert.ok(!has('asciiTable2E34', state2))
    })
    */
  })
})
