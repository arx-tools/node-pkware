/**
 * The bytes of the compressed data, the encoder writes them through this interface. The implementations
 * differ: the simple api grows one buffer from the beginning, the stream api has the chunk oriented
 * `ExpandingBuffer`, so the shared encoder can not depend on a concrete buffer.
 */
export type OutputBuffer = {
  /**
   * The number of the bytes that are written so far.
   */
  size(): number
  /**
   * Reads a byte at the given offset, a negative offset counts back from the end.
   */
  readByte(offset: number): number
  /**
   * Writes a byte at the given offset, a negative offset counts back from the end.
   */
  setByte(offset: number, value: number): void
  /**
   * Appends a byte to the end of the written data.
   */
  appendByte(value: number): void
}

/**
 * The smallest size of the growing output buffer, so an empty input does not start with a zero sized
 * allocation that has to grow on the first byte.
 */
const MINIMUM_OUTPUT_SIZE_IN_BYTES = 0x1_00

/**
 * An output buffer that grows as the encoder writes into it, which is what the simple api needs: it has
 * no chunks, only one growing buffer and the result at the end.
 */
export class GrowingOutputBuffer implements OutputBuffer {
  private bytes: Uint8Array
  private length: number = 0

  constructor(initialSize: number = 0) {
    this.bytes = new Uint8Array(Math.max(initialSize, MINIMUM_OUTPUT_SIZE_IN_BYTES))
    this.length = 0
  }

  size(): number {
    return this.length
  }

  readByte(offset: number): number {
    return this.bytes[this.resolveIndex(offset)]
  }

  setByte(offset: number, value: number): void {
    const index = this.resolveIndex(offset)

    if (index < 0 || index >= this.length) {
      return
    }

    this.bytes[index] = value
  }

  appendByte(value: number): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(Math.max(this.bytes.length * 2, MINIMUM_OUTPUT_SIZE_IN_BYTES))

      grown.set(this.bytes)
      this.bytes = grown
    }

    this.bytes[this.length] = value
    this.length = this.length + 1
  }

  /**
   * Returns the bytes that are written so far.
   *
   * @returns A copy of the written bytes, so the encoder can keep writing.
   */
  getWrittenBytes(): Uint8Array {
    return this.bytes.slice(0, this.length)
  }

  /**
   * Turns the offset into an index, a negative offset counts back from the written data.
   *
   * @param offset The offset to resolve.
   * @returns The index of the byte.
   */
  private resolveIndex(offset: number): number {
    if (offset < 0) {
      return this.length + offset
    }

    return offset
  }
}
