import { getSizeOfMatching } from './repetitions.ts'

/**
 * The state of the match finder, it keeps the latest position of every 16 bit pair of the input
 * between the calls. The caller resets it when it drops the processed part of the input.
 */
export type MatchFinderState = {
  lastOccurrences: Record<number, number>
}

/**
 * Reads the 16 bit value at the given position of the input.
 *
 * @param view The bytes of the input.
 * @param at The position of the high byte.
 * @returns The 16 bit value.
 */
function readUint16(view: Uint8Array, at: number): number {
  const highByte = view[at]
  const lowByte = view[at + 1]

  return (highByte << 8) | lowByte
}

/**
 * Finds the repetition which starts at the cursor. The finder remembers the latest position of every
 * 16 bit pair, so the repetition it finds is the closest one that starts with the same pair.
 *
 * @param state The state of the match finder.
 * @param view The bytes of the input.
 * @param cursor The position to find a repetition at.
 * @returns The length and the distance of the repetition, both zero when there is none.
 */
export function findRepetitions(
  state: MatchFinderState,
  view: Uint8Array,
  cursor: number,
): { size: number; distance: number } {
  const notEnoughBytes = cursor + 2 > view.length
  const tooClose = cursor < 2

  if (notEnoughBytes || tooClose) {
    return { size: 0, distance: 0 }
  }

  const needle = readUint16(view, cursor)
  const matchedAt = state.lastOccurrences[needle] ?? -1

  state.lastOccurrences[needle] = cursor

  if (matchedAt < 0 || matchedAt >= cursor) {
    return { size: 0, distance: 0 }
  }

  if (matchedAt === cursor - 2) {
    return { distance: 1, size: 2 }
  }

  return {
    distance: cursor - matchedAt - 1,
    size: getSizeOfMatching(view, matchedAt, cursor),
  }
}
