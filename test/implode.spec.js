const assert = require('assert')
const { beforeEach, describe, it } = require('mocha')
const {
  COMPRESSION_BINARY,
  DICTIONARY_SIZE_LARGE,
  DICTIONARY_SIZE_SMALL,
  DICTIONARY_SIZE_MEDIUM,
} = require('../src/constants.js')
const { InvalidDictionarySizeError, InvalidCompressionTypeError } = require('../src/errors.js')
const ExpandingBuffer = require('../src/helpers/ExpandingBuffer.js')
const { isFunction, isPlainObject } = require('../src/helpers/functions.js')
const { setup, outputBits, processChunkData, implode, handleFirstTwoBytes } = require('../src/implode.js')

describe('setup', () => {
  let state
  beforeEach(() => {
    state = {
      inputBuffer: new ExpandingBuffer(),
      outputBuffer: new ExpandingBuffer(),
      dictionarySizeBits: DICTIONARY_SIZE_LARGE,
      compressionType: COMPRESSION_BINARY,
    }
  })
  it('is a function', () => {
    assert.ok(isFunction(setup), `${setup} is not a function`)
  })
  it('throws an InvalidDictionarySizeError, when given state has dictionarySizeBits out of the range of 4..6', () => {
    state.dictionarySizeBits = 12
    assert.throws(() => {
      setup(state)
    }, InvalidDictionarySizeError)
  })
  it('throws an InvalidCompressionTypeError, when given state has compressionType other than 0 or 1', () => {
    state.compressionType = -7
    assert.throws(() => {
      setup(state)
    }, InvalidCompressionTypeError)
  })
  it('gets a state object and sets nChBits key to it', () => {
    setup(state)
    assert.ok(typeof state.nChBits !== 'undefined')
  })
  it('gets a state object and sets nChCodes key to it', () => {
    setup(state)
    assert.ok(typeof state.nChCodes !== 'undefined')
  })
  it('sets state.dictionarySizeMask to 0b1111, when dictionary size is small', () => {
    state.dictionarySizeBits = DICTIONARY_SIZE_SMALL
    setup(state)
    assert.strictEqual(state.dictionarySizeMask, 0b1111)
  })
  it('sets state.dictionarySizeMask to 0b11111, when dictionary size is medium', () => {
    state.dictionarySizeBits = DICTIONARY_SIZE_MEDIUM
    setup(state)
    assert.strictEqual(state.dictionarySizeMask, 0b11111)
  })
  it('sets state.dictionarySizeMask to 0b111111, when dictionary size is large', () => {
    state.dictionarySizeBits = DICTIONARY_SIZE_LARGE
    setup(state)
    assert.strictEqual(state.dictionarySizeMask, 0b111111)
  })
})

describe('outputBits', () => {
  it('is a function', () => {
    assert.ok(isFunction(outputBits), `${outputBits} is not a function`)
  })

  // TODO: create tests
})

describe('processChunkData', () => {
  it('is a function', () => {
    assert.ok(isFunction(processChunkData), `${processChunkData} is not a function`)
  })
})

describe('handleFirstTwoBytes', () => {
  let state
  beforeEach(() => {
    state = {
      startIndex: 0,
      inputBuffer: new ExpandingBuffer(),
      outputBuffer: new ExpandingBuffer(),
      dictionarySizeBits: DICTIONARY_SIZE_LARGE,
      compressionType: COMPRESSION_BINARY,
      streamEnded: false,
    }
    setup(state)
  })
  it('is a function', () => {
    assert.ok(isFunction(handleFirstTwoBytes), `${handleFirstTwoBytes} is not a function`)
  })
  it('does not increase startIndex, when there is no input data', () => {
    handleFirstTwoBytes(state)
    assert.strictEqual(state.startIndex, 0)
  })
  it('does not increase startIndex, when there is less, than 3 bytes of input data', () => {
    state.inputBuffer.append(Buffer.from('ab'))
    handleFirstTwoBytes(state)
    assert.strictEqual(state.startIndex, 0)
  })
  it('increases startIndex, when there is 3 or more bytes of input data', () => {
    state.inputBuffer.append(Buffer.from('abcde'))
    state.startIndex = 7
    handleFirstTwoBytes(state)
    assert.strictEqual(state.startIndex, 9)
  })
  it('does not increase startIndex when handledFirstTwoBytes is true', () => {
    state.inputBuffer.append(Buffer.from('abcde'))
    state.handledFirstTwoBytes = true
    const oldStartIndex = state.startIndex
    handleFirstTwoBytes(state)
    assert.strictEqual(state.startIndex, oldStartIndex)
  })
  it('can only increase startIndex once', () => {
    state.inputBuffer.append(Buffer.from('abcdefgh'))
    const oldStartIndex = state.startIndex
    handleFirstTwoBytes(state)
    handleFirstTwoBytes(state)
    handleFirstTwoBytes(state)
    handleFirstTwoBytes(state)
    handleFirstTwoBytes(state)
    assert.strictEqual(state.startIndex, oldStartIndex + 2)
  })
})

describe('implode', () => {
  it('is a function', () => {
    assert.ok(isFunction(implode), `${implode} is not a function`)
  })
  it('returns a function when called', () => {
    const handler = implode()
    assert.ok(isFunction(handler), `${handler} is not a function`)
  })
  describe('returned handler', () => {
    it('has a _state variable, which is an object', () => {
      const handler = implode()
      assert.ok(isPlainObject(handler._state), `${handler._state} is not an object`)
    })
  })
})
