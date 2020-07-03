/* global describe, it */

import assert from 'assert'
import explode from '../src/explode.mjs'

describe('explode', () => {
  it('is a function', () => {
    assert.equal(typeof explode, 'function')
  })
})
