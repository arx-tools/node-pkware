/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { isClass, bufferToString, buffersShouldEqual } = require('../../src/helpers/testing')

describe('helpers/testing', () => {
  describe('isClass', () => {
    it('is a function', () => {
      assert.ok(isFunction(isClass), `${isClass} is not a function`)
    })
    // TODO: add tests
  })

  describe('bufferToString', () => {
    it('is a function', () => {
      assert.ok(isFunction(bufferToString), `${bufferToString} is not a function`)
    })
    // TODO: add tests
  })

  describe('buffersShouldEqual', () => {
    it('is a function', () => {
      assert.ok(isFunction(buffersShouldEqual), `${buffersShouldEqual} is not a function`)
    })
    it('does not throw an error, when the contents of 2 buffers match', () => {
      const buffer1 = Buffer.from([1, 2, 3, 4])
      const buffer2 = Buffer.concat([Buffer.from([1, 2]), Buffer.from([3, 4])])
      assert.doesNotThrow(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the contents of 2 buffers differ', () => {
      const buffer1 = Buffer.from([1, 2, 3, 4])
      const buffer2 = Buffer.from([1, 2, 3])
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the 1st given parameter is not a Buffer', () => {
      const buffer1 = {
        equals: () => {
          console.log('bamboozled!')
          return true
        }
      }
      const buffer2 = Buffer.from([1, 2, 3])
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the 2nd given parameter is not a Buffer', () => {
      const buffer1 = Buffer.from([65, 66, 67])
      const buffer2 = 'abc'
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
  })
})
