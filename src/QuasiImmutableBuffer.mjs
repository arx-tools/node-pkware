export default class QuasiImmutableBuffer {
  constructor() {
    this._data = Buffer.from([])
    this._index = 0
  }

  _getActualData(offset) {
    if (offset > 0) {
      return this._data.slice(offset, this.size())
    } else {
      return this.size() === this.heapSize() ? this._data : this._data.slice(0, this.size())
    }
  }

  size() {
    return this._index
  }

  heapSize() {
    return this._data.length
  }

  append(buffer) {
    if (this._index + buffer.length < this.heapSize()) {
      for (const byte of buffer) {
        this._data[this._index++] = byte
      }
    } else {
      this._data = Buffer.concat([this._getActualData(0), buffer])
      this._index += buffer.length
    }
  }

  read(offset, limit) {
    if (typeof offset !== 'undefined' && offset + limit < this.size()) {
      return this._data.slice(offset, limit + offset)
    } else {
      return this._getActualData(offset)
    }
  }

  flushStart(numberOfBytes) {
    const filler = Buffer.alloc(this.heapSize() - numberOfBytes + 1, 0)
    this._data = Buffer.concat([this._data.slice(numberOfBytes), filler])
    this._index -= numberOfBytes
  }

  getHeap() {
    return this._data
  }
}
