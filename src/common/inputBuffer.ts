import { asByteView } from './byteView.ts'

/**
 * The bytes of the compressed data, the decoder reaches them through this interface. The
 * implementations differ: the simple api has the whole input in memory while the stream api receives
 * it in chunks, so the shared decoder can not depend on a concrete buffer.
 */
export type InputBuffer = {
  /**
   * Tells whether every byte of the input has been consumed.
   */
  isEmpty(): boolean
  /**
   * The number of the bytes that are not consumed yet.
   */
  size(): number
  /**
   * Reads a byte at the given offset from the current position.
   */
  readByte(offset: number): number
  /**
   * Drops the given number of bytes from the current position.
   */
  dropStart(numberOfBytes: number): void
}

/**
 * An input buffer over data that is available in memory as a whole, which is the case for the simple
 * api. It is never refilled, so the consumed bytes are simply skipped.
 */
export class FixedInputBuffer implements InputBuffer {
  private readonly view: Uint8Array
  private startIndex: number = 0

  constructor(input: ArrayBufferLike | Uint8Array) {
    this.view = asByteView(input)
    this.startIndex = 0
  }

  isEmpty(): boolean {
    return this.startIndex >= this.view.byteLength
  }

  size(): number {
    return this.view.byteLength - this.startIndex
  }

  readByte(offset: number): number {
    return this.view[this.startIndex + offset]
  }

  dropStart(numberOfBytes: number): void {
    this.startIndex = this.startIndex + numberOfBytes
  }
}
