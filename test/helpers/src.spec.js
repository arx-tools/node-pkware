/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { isBetween, nBitsOfOnes } = require('../../src/helpers/src.js')

describe('helpers/src', () => {
  describe('isBetween', () => {
    it('is a function', () => {
      assert.ok(isFunction(isBetween), `${isBetween} is not a function`)
    })
    it('takes 3 numbers and returns true when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 4), true)
      assert.strictEqual(isBetween(-5, 0, -1), true)
    })
    it('takes 3 numbers and returns false when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 94), false)
    })
    it('returns null, when any of the parameters are not numbers', () => {
      assert.strictEqual(isBetween('3', 12, 7), null)
      assert.strictEqual(isBetween(3, { foo: 12 }, 7), null)
      assert.strictEqual(isBetween(-1, 1, false), null)
    })
  })

  describe('nBitsOfOnes', () => {
    it('is a function', () => {
      assert.ok(isFunction(nBitsOfOnes), `${nBitsOfOnes} is not a function`)
    })
  })
})
