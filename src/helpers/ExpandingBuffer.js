const { clamp } = require('ramda')
const { ExpectedBufferError } = require('../errors')

class ExpandingBuffer {
  constructor(numberOfBytes = 0) {
    this._heap = Buffer.allocUnsafe(numberOfBytes)
    this._startIndex = 0
    this._endIndex = 0

    this._backup = {
      _startIndex: 0,
      _endIndex: 0
    }
  }

  _getActualData(offset = 0) {
    return this._heap.slice(this._startIndex + offset, this._endIndex)
  }

  size() {
    return this._endIndex - this._startIndex
  }

  isEmpty() {
    return this.size() === 0
  }

  heapSize() {
    return this._heap.length
  }

  append(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new ExpectedBufferError()
    }

    if (this._endIndex + buffer.length < this.heapSize()) {
      buffer.copy(this._heap, this._endIndex)
      this._endIndex += buffer.length
    } else {
      this._heap = Buffer.concat([this._getActualData(), buffer])
      this._startIndex = 0
      this._endIndex = this.heapSize()
    }
  }

  read(offset, limit) {
    if (offset < 0 || limit < 1) {
      return Buffer.from([])
    }
    if (limit === 1) {
      return this._heap[this._startIndex + offset]
    }

    if (offset + limit < this.size()) {
      return this._heap.slice(this._startIndex + offset, this._startIndex + limit + offset)
    }

    return this._getActualData(offset)
  }

  // hard delete
  // removes data from the buffer by copying bytes to lower indices
  flushStart(numberOfBytes) {
    numberOfBytes = clamp(0, this.heapSize(), numberOfBytes)
    if (numberOfBytes > 0) {
      if (numberOfBytes < this.heapSize()) {
        this._heap.copy(this._heap, 0, this._startIndex + numberOfBytes)
      }
      this._endIndex -= this._startIndex + numberOfBytes
      this._startIndex = 0
    }
  }

  flushEnd(numberOfBytes) {
    numberOfBytes = clamp(0, this.heapSize(), numberOfBytes)
    if (numberOfBytes > 0) {
      this._endIndex -= numberOfBytes
    }
  }

  // soft delete
  // removes data from the buffer by moving the startIndex forward
  dropStart(numberOfBytes) {
    if (numberOfBytes > 0) {
      this._startIndex += numberOfBytes
      if (this._startIndex >= this._endIndex) {
        this.clear()
      }
    }
  }

  dropEnd(numberOfBytes) {
    if (numberOfBytes > 0) {
      this._endIndex -= numberOfBytes
      if (this._startIndex >= this._endIndex) {
        this.clear()
      }
    }
  }

  getHeap() {
    return this._heap
  }

  clear() {
    this._startIndex = 0
    this._endIndex = 0
  }

  _saveIndices() {
    this._backup._startIndex = this._startIndex
    this._backup._endIndex = this._endIndex
  }

  _restoreIndices() {
    this._startIndex = this._backup._startIndex
    this._endIndex = this._backup._endIndex
  }
}

module.exports = ExpandingBuffer
