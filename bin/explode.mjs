#!/usr/bin/env node --experimental-modules

import fs from 'fs'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'
import {
  splitAtIndex,
  splitAtMatch,
  transformSplitBy,
  transformIdentity,
  through,
  transformEmpty
} from '../src/helpers.mjs'
import { BINARY_COMPRESSION, ASCII_COMPRESSION } from '../src/constants.mjs'
import { fileExists, getPackageVersion, parseNumberString } from './helpers.mjs'

const decompress = (input, output, offset, autoDetect, keepHeader, params) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = explode(params)
  const everyPkwareHeader = [
    Buffer.from([BINARY_COMPRESSION, 4]),
    Buffer.from([BINARY_COMPRESSION, 5]),
    Buffer.from([BINARY_COMPRESSION, 6]),
    Buffer.from([ASCII_COMPRESSION, 4]),
    Buffer.from([ASCII_COMPRESSION, 5]),
    Buffer.from([ASCII_COMPRESSION, 6])
  ]

  let handler = rightHandler

  if (autoDetect) {
    handler = transformSplitBy(splitAtMatch(everyPkwareHeader, offset, params.debug), leftHandler, rightHandler)
  } else if (offset > 0) {
    handler = transformSplitBy(splitAtIndex(offset), leftHandler, rightHandler)
  }

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'drop-before-offset', 'debug', 'auto-detect']
})

;(async () => {
  if (args.version) {
    console.log(await getPackageVersion())
    process.exit(0)
  }

  let input = args._[0]
  let output = args.output

  let hasErrors = false

  if (input) {
    if (await fileExists(input)) {
      input = fs.createReadStream(input)
    } else {
      console.error('error: input file does not exist')
      hasErrors = true
    }
  } else {
    input = process.openStdin()
  }

  if (output) {
    output = fs.createWriteStream(output)
  } else {
    output = process.stdout
  }

  if (hasErrors) {
    process.exit(1)
  }

  const offset = parseNumberString(args.offset, 0)
  const autoDetect = args['auto-detect']

  const keepHeader = !args['drop-before-offset']
  const params = {
    debug: args.debug,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x40000)
  }

  decompress(input, output, offset, autoDetect, keepHeader, params)
    .then(() => {
      process.exit(0)
    })
    .catch(e => {
      console.error(`Error: ${e.message}`)
      process.exit(1)
    })
})()
