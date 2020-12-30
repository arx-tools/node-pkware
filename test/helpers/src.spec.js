/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { isBetween, nBitsOfOnes, getLowestNBits, toHex, dumpBytes, isNumeric } = require('../../src/helpers/src.js')

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
    it("sorts first 2 parameters, so that parameter order doesn't matter", () => {
      assert.strictEqual(isBetween(12, 1, 4), true)
    })
    it('returns false, when first 2 parameters are equal, but the 3rd differs', () => {
      assert.strictEqual(isBetween(7, 7, 7), true)
      assert.strictEqual(isBetween(7, 7, 9), false)
    })
  })

  describe('nBitsOfOnes', () => {
    it('is a function', () => {
      assert.ok(isFunction(nBitsOfOnes), `${nBitsOfOnes} is not a function`)
    })
    it('takes a number and returns a number with the amount of lowest 1 bits based on the value of the given parameter', () => {
      assert.strictEqual(nBitsOfOnes(10), 0b1111111111)
      assert.strictEqual(nBitsOfOnes(4), 0b1111)
      assert.strictEqual(nBitsOfOnes(0), 0)
    })
    it('returns null when given number is negative', () => {
      assert.strictEqual(nBitsOfOnes(-3), null)
    })
  })

  describe('getLowestNBits', () => {
    it('is a function', () => {
      assert.ok(isFunction(getLowestNBits), `${getLowestNBits} is not a function`)
    })
  })
  describe('toHex', () => {
    it('is a function', () => {
      assert.ok(isFunction(toHex), `${toHex} is not a function`)
    })
  })
  describe('dumpBytes', () => {
    it('is a function', () => {
      assert.ok(isFunction(dumpBytes), `${dumpBytes} is not a function`)
    })
  })
  describe('isNumeric', () => {
    it('is a function', () => {
      assert.ok(isFunction(isNumeric), `${isNumeric} is not a function`)
    })
  })
})
