import { Buffer } from 'node:buffer'
import { EMPTY_BUFFER } from './constants'
import { clamp } from './functions'

const blockSize = 0x1000

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

  /**
   * Returns the number of bytes in the stored data.
   */
  size() {
    return this.#endIndex - this.#startIndex
  }

  isEmpty() {
    return this.size() === 0
  }

  /**
   * Returns the underlying Buffer's (heap) size.
   */
  heapSize() {
    return this.#heap.byteLength
  }

  /**
   * Sets a single byte of the stored data
   *
   * If offset is negative, then the method calculates the index from the end backwards
   */
  setByte(offset: number, value: number) {
    if (offset < 0) {
      if (this.#endIndex + offset < this.#startIndex) {
        return
      }

      this.#heap[this.#endIndex + offset] = value
      return
    }

    if (this.#startIndex + offset >= this.#endIndex) {
      this.#heap[this.#startIndex + offset] = value
    }
  }

  /**
   * Adds a single byte to the end of the stored data.
   * This expands the internal buffer by 0x1000 bytes if the heap is full
   */
  appendByte(value: number) {
    if (this.#endIndex + 1 < this.heapSize()) {
      this.#heap[this.#endIndex] = value
      this.#endIndex += 1
      return
    }

    const currentData = this.#getActualData()

    this.#heap = Buffer.allocUnsafe((Math.ceil((currentData.byteLength + 1) / blockSize) + 1) * blockSize)
    currentData.copy(this.#heap, 0)
    this.#heap[currentData.byteLength] = value
    this.#startIndex = 0
    this.#endIndex = currentData.byteLength + 1
  }

  /**
   * Concatenates a buffer to the end of the stored data.
   * If the new data exceeds the size of the heap then the internal heap
   * gets expanded by the integer multiples of 0x1000 bytes
   */
  append(newData: Buffer) {
    if (this.#endIndex + newData.byteLength < this.heapSize()) {
      newData.copy(this.#heap, this.#endIndex)
      this.#endIndex += newData.byteLength
      return
    }

    const currentData = this.#getActualData()

    this.#heap = Buffer.allocUnsafe(
      (Math.ceil((currentData.byteLength + newData.byteLength) / blockSize) + 1) * blockSize,
    )
    currentData.copy(this.#heap, 0)
    newData.copy(this.#heap, currentData.byteLength)

    this.#startIndex = 0
    this.#endIndex = currentData.byteLength + newData.byteLength
  }

  /**
   * Returns a slice of data from the internal data.
   * If no parameters are given then the whole amount of stored data is returned.
   * Optionally an offset and a limit can be specified:
   * offset determines the starting position, limit specifies the number of bytes read.
   *
   * Watch out! The returned slice of Buffer points to the same Buffer in memory!
   * This is intentional for performance reasons.
   */
  read(offset: number = 0, limit: number = this.size()) {
    if (offset < 0 || limit < 1) {
      return EMPTY_BUFFER
    }

    if (offset + limit < this.size()) {
      return this.#heap.subarray(this.#startIndex + offset, this.#startIndex + limit + offset)
    }

    return this.#getActualData(offset)
  }

  /**
   * Reads a single byte from the stored data
   */
  readByte(offset: number = 0) {
    return this.#heap[this.#startIndex + offset]
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
    if (numberOfBytes <= 0) {
      return
    }

    this.#startIndex += numberOfBytes
    if (this.#startIndex >= this.#endIndex) {
      this.clear()
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
    if (numberOfBytes <= 0) {
      return
    }

    this.#endIndex -= numberOfBytes
    if (this.#startIndex >= this.#endIndex) {
      this.clear()
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
