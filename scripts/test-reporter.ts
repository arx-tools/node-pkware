// The reporter of the test suite. The built in `spec` reporter prints the nested suites twice (once
// before its tests and once with their total time) and the durations with a needless precision, which
// makes the output hard to scan, so this reporter prints one line per test instead.
//
// The behavior is configured with environment variables:
// - `TEST_REPORT_FORMAT`: `flat` (default) prints one line per test, `tree` groups the tests under
//   their suite and prints the suite time once (the suite header is skipped when it holds a single
//   test, because it would not add any information);
// - `TEST_REPORT_DURATION`: `auto` (default) prints whole milliseconds below a second and seconds
//   with the precision that matters above it, `ms` always prints milliseconds, `none` hides them.

import * as process from 'node:process'
import { durationFormatFromEnvironment, formatDuration } from './formatDuration.ts'

type TestDetails = {
  type?: 'test' | 'suite'
  duration_ms?: number
  error?: Error
}

type TestData = {
  name?: string
  nesting?: number
  details?: TestDetails
  message?: string
}

type TestEvent = {
  type: string
  data?: TestData
}

const useColors = process.stdout.isTTY
const format = process.env.TEST_REPORT_FORMAT ?? 'flat'
const durationFormat = durationFormatFromEnvironment()

/**
 * Wraps the text into the given ansi color code, or leaves it alone when the output is not a terminal.
 *
 * @param code The ansi code of the color, for example `31` for red.
 * @param text The text to colorize.
 * @returns The colorized text.
 */
function colorize(code: string, text: string): string {
  if (!useColors) {
    return text
  }

  return `\u{1B}[${code}m${text}\u{1B}[39m`
}

/**
 * Wraps the formatted duration into parentheses for the printed line.
 *
 * @param milliseconds The measured time.
 * @returns The decoration, or an empty string when the durations are hidden.
 */
function decorateDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) {
    return ''
  }

  const formatted = formatDuration(milliseconds, durationFormat)

  if (formatted.length === 0) {
    return ''
  }

  return ` (${formatted})`
}

/**
 * Colours the line of a test by its result.
 *
 * @param isFailed Whether the test failed.
 * @param text The formatted line.
 * @returns The colorized line.
 */
function colorizeResult(isFailed: boolean, text: string): string {
  if (isFailed) {
    return colorize('31', text)
  }

  return colorize('32', text)
}

/**
 * Formats the error of a failed test.
 *
 * @param error The error of the test.
 * @param indent The prefix of the lines.
 * @returns The formatted error.
 */
function formatError(error: Error | undefined, indent: string): string {
  if (!error) {
    return ''
  }

  const { cause } = error as Error & { cause?: Error }
  const actual = cause ?? error
  const lines = [`${indent}error: ${actual.message}`]

  for (const line of (actual.stack ?? '').split('\n').slice(1, 9)) {
    lines.push(`${indent}${line.trim()}`)
  }

  return `${lines.join('\n')}\n`
}

/**
 * Joins the names of the suites above the given nesting level.
 *
 * @param levels The names of the suites, indexed by their nesting level.
 * @param nesting The nesting level of the printed item.
 * @returns The joined path, or an empty string when there is no suite above it.
 */
function pathOf(levels: string[], nesting: number): string {
  return levels
    .slice(0, nesting)
    .filter((name) => {
      return name.length > 0
    })
    .join(' › ')
}

/**
 * Prefixes the name with the path of its suites.
 *
 * @param path The joined path of the suites.
 * @param name The name of the printed item.
 * @returns The full name.
 */
function joinPath(path: string, name: string): string {
  if (path.length === 0) {
    return name
  }

  return `${path} › ${name}`
}

/**
 * The state of the reporter, the names and the rendered lines of the open suites.
 */
type ReporterState = {
  levels: string[]
  buffers: string[][]
  testCounts: number[]
}

/**
 * Remembers the name of the item which the test runner started to run.
 *
 * @param state The state of the reporter.
 * @param data The data of the event.
 */
function startSuite(state: ReporterState, data: TestData): void {
  const nesting = data.nesting ?? 0

  state.levels[nesting] = data.name ?? ''
  state.levels.length = nesting + 1
}

/**
 * Renders the content of a finished suite and puts it into its parent.
 *
 * @param state The state of the reporter.
 * @param data The data of the event.
 * @param isFailed Whether the suite failed.
 * @returns The printable block, or an empty string when it went into its parent.
 */
function finishSuite(state: ReporterState, data: TestData, isFailed: boolean): string {
  const nesting = data.nesting ?? 0
  const children = state.buffers[nesting + 1] ?? []
  const testCount = state.testCounts[nesting + 1] ?? 0
  const name = joinPath(pathOf(state.levels, nesting), data.name ?? '')

  state.buffers[nesting + 1] = []
  state.testCounts[nesting + 1] = 0
  state.levels.length = nesting

  let block = children.join('')

  if (format === 'tree' && testCount > 1) {
    const summary = `${testCount} tests${decorateDuration(data.details?.duration_ms)}`
    const header = colorizeResult(isFailed, `▸ ${name} · ${summary}`)

    block = `${header}\n${block}`
  }

  if (nesting === 0 || block.length === 0) {
    return block
  }

  const buffer = state.buffers[nesting] ?? []

  state.buffers[nesting] = buffer
  buffer.push(block)

  return ''
}

/**
 * Renders the line of a finished test and puts it into its suite.
 *
 * @param state The state of the reporter.
 * @param data The data of the event.
 * @param isFailed Whether the test failed.
 * @returns The printable line, or an empty string when it went into its suite.
 */
function finishTest(state: ReporterState, data: TestData, isFailed: boolean): string {
  const nesting = data.nesting ?? 0
  const name = joinPath(pathOf(state.levels, nesting), data.name ?? '')
  let icon = '✔'

  if (isFailed) {
    icon = '✘'
  }

  const line = `${colorizeResult(isFailed, `${icon} ${name}${decorateDuration(data.details?.duration_ms)}`)}\n`
  const rendered = `${line}${formatError(data.details?.error, ' '.repeat(4))}`

  state.testCounts[nesting] = (state.testCounts[nesting] ?? 0) + 1

  if (format !== 'tree') {
    return rendered
  }

  const buffer = state.buffers[nesting] ?? []

  state.buffers[nesting] = buffer
  buffer.push(rendered)

  return ''
}

/**
 * Prints the tests and their results as they arrive.
 *
 * @param source The events of the test runner.
 * @yields The formatted output of the tests.
 */
export default async function* reporter(source: AsyncIterable<TestEvent>): AsyncIterable<string> {
  const state: ReporterState = { levels: [], buffers: [], testCounts: [] }

  for await (const event of source) {
    if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      yield `${(event.data?.message ?? '').trimEnd()}\n`
      continue
    }

    const data = event.data ?? {}

    if (event.type === 'test:dequeue') {
      startSuite(state, data)
      continue
    }

    if (event.type !== 'test:pass' && event.type !== 'test:fail') {
      continue
    }

    const isFailed = event.type === 'test:fail'
    const isSuite = data.details?.type === 'suite'
    let rendered = ''

    if (isSuite) {
      rendered = finishSuite(state, data, isFailed)
    } else {
      rendered = finishTest(state, data, isFailed)
    }

    if (rendered.length > 0) {
      yield rendered
    }
  }
}
