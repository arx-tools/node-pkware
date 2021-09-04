/* global describe, it */

const assert = require('assert')
const { isFunction, isPlainObject } = require('ramda-adjunct')
const { setup, outputBits, processChunkData, implode } = require('../src/implode.js')

describe('setup', () => {
  it('is a function', () => {
    assert.ok(isFunction(setup), `${setup} is not a function`)
  })

  // TODO: create tests
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

  // TODO: create tests
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
