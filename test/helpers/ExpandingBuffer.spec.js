/* global describe, it, beforeEach */

const assert = require('assert')
const ExpandingBuffer = require('../../src/helpers/ExpandingBuffer.js')
const { isClass, buffersShouldEqual, bufferToString } = require('../../src/helpers/testing.js')

describe('ExpandingBuffer', () => {
  let buffer

  beforeEach(() => {
    buffer = new ExpandingBuffer()
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
    buffersShouldEqual(expected, result)
  })
  it('returns appended data', () => {
    buffer.append(Buffer.from([1, 2, 3]))
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
  })
  it('returns a slice of the stored data when read receives an offset and a limit', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read(0, 3)
    buffersShouldEqual(expected, result)
  })
  it('returns the whole internally stored data, when read gets a limit larger, than the size of internal data', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    const expected = Buffer.from([1, 2, 3, 4, 5])
    const result = buffer.read(0, 50)
    buffersShouldEqual(expected, result)
  })
  it('allows flushing a fix amount of bytes from the start of the internally stored data via flushStart', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    const expected = Buffer.from([4, 5])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
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
    buffersShouldEqual(expected, result)
    assert.strictEqual(expected.length, buffer.size())
  })
  it('keeps the heapSize unchanged after flushing from the beginning', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    assert.strictEqual(5, buffer.heapSize())
  })
  it('keeps the heapSize unchanged after flushing from the end', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushEnd(3)
    assert.strictEqual(5, buffer.heapSize())
  })
  it('adjusts size after flushing from the beginning', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    assert.strictEqual(2, buffer.size())
  })
  it('adjusts size after flushing from the end', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushEnd(3)
    assert.strictEqual(2, buffer.size())
  })
  it('is not increasing heapSize, when the size of data appended after flushStart is less, than the number of bytes flushed', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(3)
    buffer.append(Buffer.from([7, 8]))
    assert.strictEqual(5, buffer.heapSize())
  })
  it('is not increasing the heapSize, when the size of data appended after flushEnd is less, than the number of bytes flushed', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushEnd(3)
    buffer.append(Buffer.from([7, 8]))
    assert.strictEqual(5, buffer.heapSize())
  })
  it('re-uses the existing internal buffer, when appended data fits into the space freed by flushing from the beginning', () => {
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
  it('re-uses the existing internal buffer, when appended data fits into the space freed by flushing from the end', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushEnd(3)
    const buffer1 = buffer.getHeap()
    buffer.append(Buffer.from([7, 8]))
    const buffer2 = buffer.getHeap()
    assert.ok(
      buffer1 === buffer2,
      `reference of ${bufferToString(buffer1)} !== reference of ${bufferToString(buffer2)}`
    )
  })
  it('makes sure to only allow reading data below size and not from the heap', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(2)
    const expected = Buffer.from([5])
    const result = buffer.read(2, 2)
    buffersShouldEqual(expected, result)
  })
  it('pre-allocates internally stored data with N bytes when constructor recieves a non zero number', () => {
    const buffer = new ExpandingBuffer(100)
    assert.strictEqual(buffer.heapSize(), 100)
  })
  it('returns an empty buffer, when reading from a negative offset', () => {
    buffer.append(Buffer.from([1, 2, 3, 4]))
    const expected = Buffer.from([])
    const result = buffer.read(-7)
    buffersShouldEqual(expected, result)
  })
  it('returns an empty buffer, when reading with a limit less than 1', () => {
    buffer.append(Buffer.from([1, 2, 3, 4]))
    const expected = Buffer.from([])
    const result = buffer.read(2, -5)
    buffersShouldEqual(expected, result)
  })
  it('does nothing, when flushing 0 or less bytes', () => {
    buffer.append(Buffer.from([1, 2, 3, 4]))
    const buffer1 = buffer.getHeap()
    buffer.flushStart(-4)
    const buffer2 = buffer.getHeap()
    assert.ok(
      buffer1 === buffer2,
      `reference of ${bufferToString(buffer1)} !== reference of ${bufferToString(buffer2)}`
    )
  })
  it('clears the internally stored data, when flushing an amount bigger, than heapSize', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.flushStart(700)
    const expected = Buffer.from([])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
    assert.strictEqual(0, buffer.size())
  })
  it('clears the internally stored data, when clear is called', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.clear()
    const expected = Buffer.from([])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
    assert.strictEqual(0, buffer.size())
  })
  it('leaves the internal storage intact, when dropStart is called', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.dropStart(3)
    const expected = Buffer.from([1, 2, 3, 4, 5, 6])
    const result = buffer.getHeap()
    buffersShouldEqual(expected, result)
  })
  it('leaves the internal storage intact, when dropEnd is called', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.dropEnd(3)
    const expected = Buffer.from([1, 2, 3, 4, 5, 6])
    const result = buffer.getHeap()
    buffersShouldEqual(expected, result)
  })
  it('makes dropStart behave the same as flushStart by changing the stored data', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.dropStart(3)
    const expected = Buffer.from([4, 5, 6])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
  })
  it('makes dropEnd behave the same as flushEnd by changing the stored data', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5, 6]))
    buffer.dropEnd(3)
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
  })
  it('returns a single byte when read is called with limit = 1', () => {
    buffer.append(Buffer.from([1, 2, 3]))
    assert.strictEqual(2, buffer.read(1, 1))
  })
  it('removes data from the beginning of the internal storage via flashStart', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushStart(2)
    const expected = Buffer.from([3, 4, 5])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
  })
  it('removes data from the end of the internal storage via flashEnd', () => {
    buffer.append(Buffer.from([1, 2, 3, 4, 5]))
    buffer.flushEnd(2)
    const expected = Buffer.from([1, 2, 3])
    const result = buffer.read()
    buffersShouldEqual(expected, result)
  })
  it('throws an error when append gets non-buffer data', () => {
    assert.throws(
      () => {
        buffer.append('Hello')
      },
      {
        name: 'ExpectedBufferError'
      }
    )
  })
})
