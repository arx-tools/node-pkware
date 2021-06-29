/* global describe, it */

const assert = require('assert')
const { Readable } = require('stream')
const { isFunction } = require('ramda-adjunct')
const { splitAt, transformIdentity, transformEmpty, through, transformSplitBy } = require('../../src/helpers/stream.js')
const { buffersShouldEqual, streamToBuffer } = require('../../src/helpers/testing.js')

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
      it('returns the given buffer as the second item and an empty buffer as the first in an array, when index is 0', () => {
        const result = splitAt(0)(Buffer.from([1, 2, 3]))
        buffersShouldEqual(result[0], Buffer.from([]))
        buffersShouldEqual(result[1], Buffer.from([1, 2, 3]))
      })
      it('splits the given buffer into 2, when index is greater than zero and less than the buffer size', () => {
        const result = splitAt(2)(Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result[0], Buffer.from([1, 2]))
        buffersShouldEqual(result[1], Buffer.from([3, 4, 5]))
      })
      it('only splits first buffer, when index is less or equal to the length of the first buffer', () => {
        const handler = splitAt(4)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4]))
        buffersShouldEqual(result1[1], Buffer.from([5]))
        buffersShouldEqual(result2[0], Buffer.from([]))
        buffersShouldEqual(result2[1], Buffer.from([6, 7, 8, 9, 10]))
      })
      it('only splits second buffer, when index is greater, than the length of the first buffer', () => {
        const handler = splitAt(8)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result1[1], Buffer.from([]))
        buffersShouldEqual(result2[0], Buffer.from([6, 7, 8]))
        buffersShouldEqual(result2[1], Buffer.from([9, 10]))
      })
      it('does not split input buffers, but places them in opposing slots, when index matches the size of buffer', () => {
        const handler = splitAt(5)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result1[1], Buffer.from([]))
        buffersShouldEqual(result2[0], Buffer.from([]))
        buffersShouldEqual(result2[1], Buffer.from([6, 7, 8, 9, 10]))
      })
      it('returns all buffers to the left slot as long as the index exceeds their length', () => {
        const handler = splitAt(30)
        const result1 = handler(Buffer.from([1, 2, 3, 4, 5]))
        const result2 = handler(Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result1[0], Buffer.from([1, 2, 3, 4, 5]))
        buffersShouldEqual(result1[1], Buffer.from([]))
        buffersShouldEqual(result2[0], Buffer.from([6, 7, 8, 9, 10]))
        buffersShouldEqual(result2[1], Buffer.from([]))
      })
      it('returns null when index is a negative integer', () => {
        const badResult = splitAt(-2)(Buffer.from([1, 2, 3]))
        assert.strictEqual(badResult, null)
      })
      it('returns null when index is not an integer', () => {
        const badResult1 = splitAt(3.14)(Buffer.from([1, 2, 3]))
        const badResult2 = splitAt('foo')(Buffer.from([1, 2, 3]))
        const badResult3 = splitAt([1])(Buffer.from([1, 2, 3]))
        assert.strictEqual(badResult1, null)
        assert.strictEqual(badResult2, null)
        assert.strictEqual(badResult3, null)
      })
      it('return null, when handler gets non-buffer data', () => {
        const handler = splitAt(3)
        assert.strictEqual(handler('abcde'), null)
        assert.strictEqual(handler(16), null)
        assert.strictEqual(handler(['a', 'b', 'c']), null)
      })
      it('does not increate the internal counter, when handler gets non-buffer-data', () => {
        const handler = splitAt(4)
        const result1 = handler('abcdef')
        const result2 = handler(Buffer.from([1, 2, 3, 4, 5]))
        assert.strictEqual(result1, null)
        buffersShouldEqual(result2[0], Buffer.from([1, 2, 3, 4]))
        buffersShouldEqual(result2[1], Buffer.from([5]))
      })
    })
  })

  describe('transformIdentity', () => {
    it('is a function', () => {
      assert.ok(isFunction(transformIdentity), `${transformIdentity} is not a function`)
    })
    it('takes no argument and returns a function', () => {
      const handler = transformIdentity()
      assert.strictEqual(isFunction(handler), true)
    })
    describe('returned handler', () => {
      it('takes a Buffer, an encoding and an error first, data second callback function and calls it with the given Buffer', done => {
        const handler = transformIdentity()
        const callback = (error, data) => {
          assert.strictEqual(error, null, '1st parameter (error) in the callback should be null')
          buffersShouldEqual(data, Buffer.from([1, 2, 3]))
          done()
        }
        handler(Buffer.from([1, 2, 3]), null, callback)
      })
      it("passes whatever was given as the 1st parameter to the callback's 2nd parameter", done => {
        const handler = transformIdentity()
        const callback = (error, data) => {
          assert.strictEqual(error, null, '1st parameter (error) in the callback should be null')
          assert.strictEqual(data, '#ffffff')
          done()
        }
        handler('#ffffff', '', callback)
      })
      it('can be given to a throughstream and will not change the input chunks', done => {
        Readable.from('this is a test')
          .pipe(through(transformIdentity()))
          .pipe(
            streamToBuffer(buffer => {
              buffersShouldEqual(buffer, Buffer.from('this is a test'))
              done()
            })
          )
      })
    })
  })

  describe('transformEmpty', () => {
    it('is a function', () => {
      assert.ok(isFunction(transformEmpty), `${transformEmpty} is not a function`)
    })
    it('takes no argument and returns a function', () => {
      const handler = transformEmpty()
      assert.strictEqual(isFunction(handler), true)
    })
    describe('returned handler', () => {
      it('takes a Buffer, an encoding and an error first, data second callback function and calls it with an empty Buffer', done => {
        const handler = transformEmpty()
        const callback = (error, data) => {
          assert.strictEqual(error, null, '1st parameter (error) in the callback should be null')
          buffersShouldEqual(data, Buffer.from([]))
          done()
        }
        handler(Buffer.from([1, 2, 3]), null, callback)
      })
      it('can be given to a throughstream and will always return an empty buffer', done => {
        Readable.from('this is a test')
          .pipe(through(transformEmpty()))
          .pipe(
            streamToBuffer(buffer => {
              buffersShouldEqual(buffer, Buffer.from([]))
              done()
            })
          )
      })
    })
  })

  describe('through', () => {
    it('is a function', () => {
      assert.ok(isFunction(through), `${through} is not a function`)
    })
    // TODO: how to test this?
  })

  describe('transformSplitBy', () => {
    it('is a function', () => {
      assert.ok(isFunction(transformSplitBy), `${transformSplitBy} is not a function`)
    })
  })
})
