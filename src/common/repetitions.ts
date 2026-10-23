import { LONGEST_ALLOWED_REPETITION } from '../constants.ts'
import { clamp } from '../functions.ts'

/**
 * Counts the matching bytes at the two positions of the input, the function assumes a < b - 2.
 *
 * @param view The bytes to compare in.
 * @param a The index of the first repetition.
 * @param b The index of the second repetition, it has to be greater than `a`.
 * @returns The number of the matching bytes, at least 2 and at most the longest allowed repetition.
 */
export function getSizeOfMatching(view: Uint8Array, a: number, b: number): number {
  const maxLength = clamp(b - a, 2, LONGEST_ALLOWED_REPETITION)

  for (let i = 2; i <= maxLength; i++) {
    if (view[a + i] !== view[b + i]) {
      return i
    }
  }

  return maxLength
}

/**
 * Tells whether the repetition can be flushed at the current position.
 *
 * @param size The number of the bytes in the repetition.
 * @param distance How many bytes back the repetition starts.
 * @param remainingInputSize The number of the bytes that are not processed yet.
 * @returns False when it is not flushable, true when it is, and null when it is flushable but a
 * better repetition might be found.
 */
export function isRepetitionFlushable(size: number, distance: number, remainingInputSize: number): boolean | null {
  if (size === 0) {
    return false
  }

  // If we found repetition of 2 bytes, that is 0x1_00 or further back,
  // don't bother. Storing the distance of 0x1_00 bytes would actually
  // take more space than storing the 2 bytes as-is.
  if (size === 2 && distance >= 0x1_00) {
    return false
  }

  if (size >= 8 || remainingInputSize < 2) {
    return true
  }

  return null
}
