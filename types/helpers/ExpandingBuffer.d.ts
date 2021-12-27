export = ExpandingBuffer
declare class ExpandingBuffer {
  constructor(numberOfBytes?: number)
  _heap: Buffer
  _startIndex: number
  _endIndex: number
  _backup: {
    _startIndex: number
    _endIndex: number
  }
  _getActualData(offset?: number): Buffer
  size(): number
  isEmpty(): boolean
  heapSize(): number
  append(buffer: Buffer): void
  read(offset?: number, limit?: number): number | Buffer
  flushStart(numberOfBytes: number): void
  flushEnd(numberOfBytes: number): void
  dropStart(numberOfBytes: number): void
  dropEnd(numberOfBytes: number): void
  getHeap(): Buffer
  clear(): void
  _saveIndices(): void
  _restoreIndices(): void
}
