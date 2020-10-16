/* global describe, it, beforeEach */

import assert from 'assert'
import QuasiImmutableBuffer from '../src/QuasiImmutableBuffer.mjs'
import { isClass } from './helpers.mjs'

// https://stackoverflow.com/a/48845122/1806628
const bufferToString = buffer => {
  let hexString = buffer.toString('hex')
  hexString = hexString.length > 2 ? hexString.match(/../g).join(' ') : hexString
  return `<Buffer ${hexString}>`
}

const compareBuffers = (expected, result) => {
  assert.ok(expected.equals(result), `${bufferToString(expected)} !== ${bufferToString(result)}`)
}

describe('QuasiImmutableBuffer', () => {
  let buffer

  beforeEach(() => {
    buffer = new QuasiImmutableBuffer()
  })

  it('is a class', () => {
    assert.ok(isClass(buffer), `${buffer} is not a class`)
  })
  it('starts out empty', () => {
    assert.strictEqual(buffer.size(), 0)
  })
  it('has an append method for adding new data', () => {
    buffer.append(Buffer.from([1, 2, 3]))
    assert.notStrictEqual(buffer.size(), 0)
  })
  it('returns an empty buffer when reading without any stored data', () => {
    const expected = Buffer.from([])
    const result = buffer.read()
    compareBuffers(expected, result)
  })
  it('returns appended data', () => {
    buffer.append(Buffer.from([1, 2, 3]))
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read()
    compareBuffers(expected, result)
  })
  it('returns a slice of the stored data when read receives an offset and a limit', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read(0, 3)
    compareBuffers(expected, result)
  })
  it('returns the whole internally stored data, when read gets a limit larger, than the size of internal data', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    const expected = Buffer.from([1, 2, 3, 4, 5])
    const result = buffer.read(0, 50)
    compareBuffers(expected, result)
  })
  it('allows flushing a fix amount of bytes from the start of the internally stored data via flushStart', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    const expected = Buffer.from([4, 5])
    const result = buffer.read()
    compareBuffers(expected, result)
  })
  it('has the heapSize method for reading the size of the internal buffer', () => {
    buffer.append(Buffer.from([1, 2, 3, 4]))
    assert.strictEqual(buffer.heapSize(), 4)
  })
  it('accumulates appended buffers', () => {
    buffer.append(Buffer.from([1, 2]))
    buffer.append(Buffer.from([3, 4]))
    const expected = Buffer.from([1, 2, 3, 4])
    const result = buffer.read()
    compareBuffers(expected, result)
    assert.strictEqual(expected.length, buffer.size())
  })
  it('keeps the heapSize unchanged after flushing', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    assert.strictEqual(5, buffer.heapSize())
  })
  it('adjusts size after flushing', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    assert.strictEqual(2, buffer.size())
  })
  it('is not increasing the heapSize, when the size of data appended after flushing is less, than the number of bytes flushed', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    buffer.append(Buffer.from([7, 8]))
    assert.strictEqual(5, buffer.heapSize())
  })
  it('re-uses the existing internal buffer, when appended data fits into the space freed by flushing', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    const buffer1 = buffer.getHeap()
    buffer.append(Buffer.from([7, 8]))
    const buffer2 = buffer.getHeap()
    assert.ok(
      buffer1 === buffer2,
      `reference of ${bufferToString(buffer1)} !== reference of ${bufferToString(buffer2)}`
    )
  })
})
