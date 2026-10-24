// The formatter of the measured times. Both the test reporter and the timing logs of the specs use it,
// so a duration is printed the same way everywhere: whole milliseconds below a second, seconds with
// two decimals above it, and a single decimal above a hundred seconds.

import * as process from 'node:process'

/**
 * The supported duration formats.
 */
export type DurationFormat = 'auto' | 'ms' | 'none'

/**
 * Rounds the value to four meaningful digits and drops the trailing zeros, so a measurement never
 * prints more digits than it is worth: `6.983`, `56.83`, `230.4`.
 *
 * @param value The measured time in the unit it is printed with.
 * @returns The rounded value.
 */
function roundToFourDigits(value: number): string {
  const integerDigits = Math.max(1, Math.trunc(value).toString().length)
  const rounded = value.toFixed(Math.max(0, 4 - integerDigits))

  if (!rounded.includes('.')) {
    return rounded
  }

  let trimmed = rounded

  while (trimmed.endsWith('0')) {
    trimmed = trimmed.slice(0, -1)
  }

  if (trimmed.endsWith('.')) {
    return trimmed.slice(0, -1)
  }

  return trimmed
}

/**
 * Formats a measured time so the number of the digits does not get in the way of reading it.
 *
 * @param milliseconds The measured time.
 * @param format The requested format, `auto` by default.
 * @returns The formatted duration, or an empty string when the durations are hidden.
 */
export function formatDuration(milliseconds: number, format: DurationFormat = 'auto'): string {
  if (format === 'none') {
    return ''
  }

  if (format === 'ms' || milliseconds < 1_000) {
    return `${roundToFourDigits(milliseconds)}ms`
  }

  return `${roundToFourDigits(milliseconds / 1_000)}s`
}

/**
 * Reads the requested duration format from the environment.
 *
 * @returns The configured format, `auto` when it is not set.
 */
export function durationFormatFromEnvironment(): DurationFormat {
  const configured = process.env.TEST_REPORT_DURATION
  const known: DurationFormat[] = ['auto', 'ms', 'none']

  if (configured !== undefined && (known as string[]).includes(configured)) {
    return configured as DurationFormat
  }

  return 'auto'
}
