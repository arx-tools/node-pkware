import { clamp } from '../node_modules/ramda/src/index.mjs'

export default class QuasiImmutableBuffer {
  constructor(numberOfBytes = 0) {
    this._heap = Buffer.allocUnsafe(numberOfBytes)
    this._startIndex = 0
    this._endIndex = 0

    this._backup = {
      _heap: null
    }
  }

  _getActualData(offset = 0) {
    return this._heap.slice(this._startIndex + offset, this._endIndex)
  }

  size() {
    return this._endIndex - this._startIndex
  }

  heapSize() {
    return this._heap.length
  }

  append(buffer) {
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

  dropStart(numberOfBytes) {
    if (numberOfBytes > 0) {
      this._startIndex += numberOfBytes
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

  backup() {
    this._backup._heap = Buffer.from(this.read())
  }

  restore() {
    this._backup._heap.copy(this._heap, 0)
    this._startIndex = 0
    this._endIndex = this._backup._heap.length
  }
}
