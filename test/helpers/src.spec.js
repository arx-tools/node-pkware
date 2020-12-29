/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { isBetween } = require('../../src/helpers/src.js')

describe('helpers/src', () => {
  describe('isBetween', () => {
    it('is a function', () => {
      assert.ok(isFunction(isBetween), `${isBetween} is not a function`)
    })
    it('takes 3 numbers and returns true when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 4), true)
    })
    it('takes 3 numbers and returns false when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 94), false)
    })
  })
})
