import { getLowestNBitsOf } from '../functions.ts'
import type { OutputBuffer } from './outputBuffer.ts'

/**
 * The state that the shared encoder functions read and write. An implode instance of either api can
 * satisfy it, so the algorithm below runs on the same state as the surrounding class.
 */
export type EncoderState = {
  outBits: number
  outputBuffer: OutputBuffer
}

/**
 * Writes the given number of bits into the output buffer. The bits are packed into bytes, and the last,
 * not yet complete byte is overwritten by the next call, so the caller only has to write the bits in
 * the order the format expects them.
 *
 * @param state The current state of the encoder.
 * @param numberOfBits The number of the bits to write.
 * @param bitBuffer The bits to write, in the lowest bits of the number.
 */
export function outputBits(state: EncoderState, numberOfBits: number, bitBuffer: number): void {
  if (numberOfBits > 8) {
    outputBits(state, 8, bitBuffer)
    bitBuffer = bitBuffer >> 8
    numberOfBits = numberOfBits - 8
  }

  const { outBits } = state
  const lastByte = state.outputBuffer.readByte(state.outputBuffer.size() - 1)

  state.outputBuffer.setByte(-1, lastByte | getLowestNBitsOf(bitBuffer << outBits, 8))
  state.outBits = outBits + numberOfBits

  if (state.outBits > 8) {
    state.outBits = getLowestNBitsOf(state.outBits, 3)
    bitBuffer = bitBuffer >> (8 - outBits)
    state.outputBuffer.appendByte(getLowestNBitsOf(bitBuffer, 8))

    return
  }

  state.outBits = getLowestNBitsOf(state.outBits, 3)

  if (state.outBits === 0) {
    state.outputBuffer.appendByte(0)
  }
}
