#!/usr/bin/env node

// `node --test` exits with 0 when the given glob matches nothing: it runs zero tests and reports
// success, so a broken path or a renamed folder looks like a green suite. this runner starts the test
// command, reads the number of the executed tests from a tap report and fails when there was none.
//
// the human readable report is written straight to the inherited stdio, so the colors of the reporter
// stay intact, while the machine readable tap report goes into a temporary file. a pipe would make the
// reporter drop the colors, which is why the tap report is not read from the stdout.

import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as process from 'node:process'

const DEFAULT_TEST_FILE_PATTERN = 'tests/**/*.spec.ts'

/**
 * The number of the executed tests, the reporter prints it in the summary.
 */
const TEST_COUNT_PATTERN = /^# tests (?<count>\d+)$/m

/**
 * The number of the failed tests, the reporter prints it in the summary.
 */
const TEST_FAILURE_PATTERN = /^# fail (?<count>\d+)$/m

const useColors = process.stdout.isTTY

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
 * Reads a value from the summary of the tap report.
 *
 * @param report The content of the tap report.
 * @param pattern The pattern that contains the value in a named group.
 * @returns The parsed number, or zero when the pattern did not match.
 */
function readSummaryValue(report: string, pattern: RegExp): number {
  const match = pattern.exec(report)

  return Number.parseInt(match?.groups?.count ?? '0', 10)
}

const [pattern = DEFAULT_TEST_FILE_PATTERN] = process.argv.slice(2)
const reportFile = path.join(tmpdir(), `node-pkware-tests-${process.pid}.tap`)

const child = spawn(
  process.execPath,
  [
    '--test',
    '--test-reporter=./scripts/test-reporter.ts',
    '--test-reporter-destination=stdout',
    '--test-reporter=tap',
    `--test-reporter-destination=${reportFile}`,
    pattern,
  ],
  { stdio: 'inherit' },
)

child.on('close', async (exitCode: number | null) => {
  let report = ''

  try {
    report = await readFile(reportFile, 'utf8')
    await rm(reportFile, { force: true })
  } catch {
    report = ''
  }

  const testCount = readSummaryValue(report, TEST_COUNT_PATTERN)
  const failedCount = readSummaryValue(report, TEST_FAILURE_PATTERN)

  if (failedCount > 0) {
    console.error(`\n${colorize('31', `✘ ${failedCount} of ${testCount} tests failed`)}`)

    if (exitCode === null || exitCode === 0) {
      process.exit(1)
    }

    process.exit(exitCode)
  }

  if (exitCode !== 0) {
    process.exit(exitCode ?? 1)
  }

  if (testCount === 0) {
    console.error(`no test was executed by "node --test ${pattern}", is the pattern correct?`)
    process.exit(1)
  }

  console.log(`\n${colorize('32', `✔ ${testCount} tests passed`)}`)
})
