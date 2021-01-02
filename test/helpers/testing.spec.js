/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const { isClass, bufferToString, buffersShouldEqual } = require('../../src/helpers/testing')

describe('helpers/testing', () => {
  describe('isClass', () => {
    it('is a function', () => {
      assert.ok(isFunction(isClass), `${isClass} is not a function`)
    })
  })

  describe('bufferToString', () => {
    it('is a function', () => {
      assert.ok(isFunction(bufferToString), `${bufferToString} is not a function`)
    })
  })

  describe('buffersShouldEqual', () => {
    it('is a function', () => {
      assert.ok(isFunction(buffersShouldEqual), `${buffersShouldEqual} is not a function`)
    })
  })
})
