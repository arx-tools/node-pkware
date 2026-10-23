#!/usr/bin/env node

// `node --test` exits with 0 when the given glob matches nothing: it runs zero tests and reports
// success, so a broken path or a renamed folder looks like a green suite. this runner forwards the
// output of the test command, reads the number of the executed tests from its summary and fails when
// there was none.

import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import * as process from 'node:process'

const DEFAULT_TEST_FILE_PATTERN = 'tests/**/*.spec.ts'

/**
 * The summary line the test reporter prints when it is done
 */
const TEST_COUNT_PATTERN = /^# tests (?<count>\d+)$/m

const [pattern = DEFAULT_TEST_FILE_PATTERN] = process.argv.slice(2)

const child = spawn(process.execPath, ['--test', pattern], {
  stdio: ['ignore', 'pipe', 'inherit'],
})

let output = ''

child.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString()
  output = output + text
  process.stdout.write(text)
})

child.on('close', (exitCode: number | null) => {
  if (exitCode !== 0) {
    process.exit(exitCode ?? 1)
  }

  const match = TEST_COUNT_PATTERN.exec(output)

  if (!match) {
    console.error(`the test summary is missing in the output of "node --test ${pattern}"`)
    process.exit(1)
  }

  const testCount = Number.parseInt(match.groups?.count ?? '0', 10)

  if (testCount === 0) {
    console.error(`no test was executed by "node --test ${pattern}", is the pattern correct?`)
    process.exit(1)
  }

  console.log(`\nexecuted ${testCount} tests`)
})
