/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { splitAt } = require('../../src/helpers/stream.js')
const { buffersShouldEqual } = require('../../src/helpers/testing.js')

describe('helpers/stream', () => {
  describe('splitAt', () => {
    it('is a function', () => {
      assert.ok(isFunction(splitAt), `${splitAt} is not a function`)
    })
    it('takes a number and returns a function', () => {
      const handler = splitAt(12)
      assert.strictEqual(isFunction(handler), true)
    })

    describe('returned handler', () => {
      it('returns an array of 2 Buffers', () => {
        const result = splitAt(4)(Buffer.from([]))
        assert.strictEqual(Array.isArray(result), true)
        assert.strictEqual(result.length, 2)
        assert.strictEqual(result[0] instanceof Buffer, true)
        assert.strictEqual(result[1] instanceof Buffer, true)
      })
      it('returns the given buffer as the second item and an empty buffer as the first in an array, when the outer function receives 0', () => {
        const result = splitAt(0)(Buffer.from([1, 2, 3]))
        buffersShouldEqual(result[0], Buffer.from([]))
        buffersShouldEqual(result[1], Buffer.from([1, 2, 3]))
      })
      it('splits the given buffer into 2, when the outer function receives a number greater than zero and less than the buffer size', () => {
        const result = splitAt(2)(Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result[0], Buffer.from([1, 2]))
        buffersShouldEqual(result[1], Buffer.from([3, 4, 5]))
      })
      it('only splits first buffer, when number given to the outer function is less or equal to the length of the first buffer', () => {
        const handler = splitAt(4)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4]))
        buffersShouldEqual(result1[1], Buffer.from([5]))
        buffersShouldEqual(result2[0], Buffer.from([]))
        buffersShouldEqual(result2[1], Buffer.from([6, 7, 8, 9, 10]))
      })
      it('only splits second buffer, when number given to the outer function is greater, than the length of the first buffer', () => {
        const handler = splitAt(8)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result1[1], Buffer.from([]))
        buffersShouldEqual(result2[0], Buffer.from([6, 7, 8]))
        buffersShouldEqual(result2[1], Buffer.from([9, 10]))
      })
      // TODO: edge case handling
      // TODO: error handling
      // TODO: preserving "this" in the returned handler
    })
  })
})
