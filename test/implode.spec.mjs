/* global describe, it */

import assert from 'assert'
import implode from '../src/implode.mjs'

describe('implode', () => {
  it('is a function', () => {
    assert.equal(typeof implode, 'function')
  })
})
