import { Buffer } from 'node:buffer'
import { clamp } from './functions'

export class ExpandingBuffer {
  #heap: Buffer
  #startIndex: number = 0
  #endIndex: number = 0
  #backup: { startIndex: number; endIndex: number } = {
    startIndex: 0,
    endIndex: 0,
  }

  constructor(numberOfBytes: number = 0) {
    this.#heap = Buffer.allocUnsafe(numberOfBytes)
  }

  #getActualData(offset: number = 0) {
    return this.#heap.subarray(this.#startIndex + offset, this.#endIndex)
  }

  size() {
    return this.#endIndex - this.#startIndex
  }

  isEmpty() {
    return this.size() === 0
  }

  heapSize() {
    return this.#heap.length
  }

  append(buffer: Buffer) {
    if (this.#endIndex + buffer.length < this.heapSize()) {
      buffer.copy(this.#heap, this.#endIndex)
      this.#endIndex += buffer.length
    } else {
      this.#heap = Buffer.concat([this.#getActualData(), buffer])
      this.#startIndex = 0
      this.#endIndex = this.heapSize()
    }
  }

  /**
   * Watch out! The returned slice of Buffer points to the same Buffer in memory!
   */
  read(offset: number = 0, limit: number = this.size()) {
    if (offset < 0 || limit < 1) {
      return Buffer.from([])
    }

    if (limit === 1) {
      return this.#heap[this.#startIndex + offset]
    }

    if (offset + limit < this.size()) {
      return this.#heap.subarray(this.#startIndex + offset, this.#startIndex + limit + offset)
    }

    return this.#getActualData(offset)
  }

  /**
   * Does hard delete
   *
   * Removes data from the start of the internal buffer (heap)
   * by copying bytes to lower indices making sure the
   * startIndex goes back to 0 afterwards
   */
  flushStart(numberOfBytes: number) {
    numberOfBytes = clamp(0, this.heapSize(), numberOfBytes)
    if (numberOfBytes > 0) {
      if (numberOfBytes < this.heapSize()) {
        this.#heap.copy(this.#heap, 0, this.#startIndex + numberOfBytes)
      }

      this.#endIndex -= this.#startIndex + numberOfBytes
      this.#startIndex = 0
    }
  }

  /**
   * Does hard delete
   *
   * Removes data from the end of the internal buffer (heap)
   * by moving the endIndex back
   */
  flushEnd(numberOfBytes: number) {
    const clampedNumberOfBytes = clamp(0, this.heapSize(), numberOfBytes)
    if (clampedNumberOfBytes > 0) {
      this.#endIndex -= clampedNumberOfBytes
    }
  }

  /**
   * Does soft delete
   *
   * Removes data from the start of the internal buffer (heap)
   * by moving the startIndex forward
   * When the heap gets empty it also resets the indices as a cleanup
   */
  dropStart(numberOfBytes: number) {
    if (numberOfBytes > 0) {
      this.#startIndex += numberOfBytes
      if (this.#startIndex >= this.#endIndex) {
        this.clear()
      }
    }
  }

  /**
   * Does soft delete
   *
   * removes data from the end of the internal buffer (heap)
   * by moving the endIndex back
   * When the heap gets empty it also resets the indices as a cleanup
   */
  dropEnd(numberOfBytes: number) {
    if (numberOfBytes > 0) {
      this.#endIndex -= numberOfBytes
      if (this.#startIndex >= this.#endIndex) {
        this.clear()
      }
    }
  }

  /**
   * returns the internal buffer
   */
  getHeap() {
    return this.#heap
  }

  clear() {
    this.#startIndex = 0
    this.#endIndex = 0
  }

  saveIndices() {
    this.#backup.startIndex = this.#startIndex
    this.#backup.endIndex = this.#endIndex
  }

  restoreIndices() {
    this.#startIndex = this.#backup.startIndex
    this.#endIndex = this.#backup.endIndex
  }
}
