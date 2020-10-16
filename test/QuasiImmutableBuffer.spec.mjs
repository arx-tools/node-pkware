/* global describe, it, beforeEach */

import assert from 'assert'
import QuasiImmutableBuffer from '../src/QuasiImmutableBuffer.mjs'
import { isClass } from './helpers.mjs'

describe('QuasiImmutableBuffer', () => {
  let buffer
  beforeEach(() => {
    buffer = new QuasiImmutableBuffer()
  })
  it('is a class', () => {
    assert.ok(isClass(buffer))
  })
})
