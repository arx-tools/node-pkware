import { clamp } from '../node_modules/ramda/src/index.mjs'

export default class QuasiImmutableBuffer {
  constructor(numberOfBytes = 0) {
    this._heap = Buffer.alloc(numberOfBytes, 0)
    this._index = 0
  }

  _getActualData(offset) {
    if (this.size() === this.heapSize() && offset <= 0) {
      return this._heap
    } else {
      return this._heap.slice(offset, this.size())
    }
  }

  size() {
    return this._index
  }

  heapSize() {
    return this._heap.length
  }

  append(buffer) {
    if (this._index + buffer.length < this.heapSize()) {
      for (const byte of buffer) {
        this._heap[this._index++] = byte
      }
    } else {
      this._heap = Buffer.concat([this._getActualData(0), buffer])
      this._index += buffer.length
    }
  }

  read(offset, limit) {
    if (offset < 0 || limit < 1) {
      return Buffer.from([])
    }
    if (offset + limit < this.size()) {
      return this._heap.slice(offset, limit + offset)
    } else {
      return this._getActualData(offset)
    }
  }

  flushStart(numberOfBytes) {
    numberOfBytes = clamp(0, this.heapSize(), numberOfBytes)
    if (numberOfBytes > 0) {
      if (numberOfBytes === this.heapSize()) {
        this._heap.fill(0)
      } else {
        for (let i = numberOfBytes; i < this.heapSize(); i++) {
          this._heap[i - numberOfBytes] = this._heap[i] || 0
        }
      }
      this._index -= numberOfBytes
    }
  }

  getHeap() {
    return this._heap
  }
}
