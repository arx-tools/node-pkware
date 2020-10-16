export default class QuasiImmutableBuffer {
  constructor() {
    this._ = {
      data: Buffer.from([]),
      index: 0
    }
  }

  size() {
    return this._.index
  }

  heapSize() {
    return this._.data.length
  }

  append(buffer) {
    if (this.size() === this.heapSize()) {
      this._.data = Buffer.concat([this._.data, buffer])
      this._.index += buffer.length
    } else {
      if (this._.index + buffer.length < this.heapSize()) {
        for (const byte of buffer) {
          this._.data[this._.index++] = byte
        }
      } else {
        this._.data = Buffer.concat([this._.data.slice(0, this.size()), buffer])
        this._.index += buffer.length
      }
    }
  }

  read(offset, limit) {
    if (typeof offset !== 'undefined' && limit < this.size()) {
      return this._.data.slice(offset, limit + offset)
    } else {
      return this._.data.slice(0, this.size())
    }
  }

  flushStart(numberOfBytes) {
    const filler = Buffer.alloc(this.heapSize() - numberOfBytes + 1, 0)
    this._.data = Buffer.concat([this._.data.slice(numberOfBytes), filler])
    this._.index -= numberOfBytes
  }

  getHeap() {
    return this._.data
  }
}
