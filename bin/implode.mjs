#!/usr/bin/env node --experimental-modules --no-warnings

import fs from 'fs'
import minimist from 'minimist'
import {
  implode,
  ASCII_COMPRESSION,
  BINARY_COMPRESSION,
  DICTIONARY_SIZE1,
  DICTIONARY_SIZE2,
  DICTIONARY_SIZE3
} from '../src/index.mjs'
import { isBetween, through, transformSplitByIdx, transformIdentity } from '../src/helpers.mjs'
import { isNil } from '../node_modules/ramda/src/index.mjs'
import { fileExists, getPackageVersion } from './helpers.mjs'

console.log(`node-pkware v${getPackageVersion()}`)

const args = minimist(process.argv.slice(2), {
  string: ['input', 'output'],
  boolean: ['binary', 'ascii']
})

let hasErrors = false

if (!args.input) {
  console.error('error: --input not specified')
  hasErrors = true
} else if (!fileExists(args.input)) {
  console.error()
}

if (args.ascii && args.binary) {
  console.error('error: --ascii and --binary both specified, can only work with one')
  hasErrors = true
} else if (!args.ascii && !args.binary) {
  console.error('error: compression type missing: --ascii or --binary was not specified')
  hasErrors = true
}

if (!args.level) {
  console.error('error: compression level missing: --level was not specified')
  hasErrors = true
} else if (!isBetween(1, 3, args.level)) {
  console.error('error: incorrect compression level specified: --level should be between 1 and 3')
  hasErrors = true
}

if (hasErrors) {
  process.exit(1)
}

if (!args.output) {
  console.warn(`warning: --output not specified, output will be generated to "${args.input}.compressed"`)
}

const decompress = (input, output, offset, compressionType, dictionarySize) => {
  const handler = isNil(offset)
    ? implode(compressionType, dictionarySize)
    : transformSplitByIdx(offset, transformIdentity(), implode(compressionType, dictionarySize))

  return new Promise((resolve, reject) => {
    fs.createReadStream(input)
      .pipe(through(handler).on('error', reject))
      .pipe(fs.createWriteStream(output || `${input}.compressed`))
      .on('finish', resolve)
      .on('error', reject)
  })
}

const compressionType = args.ascii ? ASCII_COMPRESSION : BINARY_COMPRESSION
const dictionarySize = args.level === 1 ? DICTIONARY_SIZE1 : args.level === 2 ? DICTIONARY_SIZE2 : DICTIONARY_SIZE3
decompress(args.input, args.output, args.offset, compressionType, dictionarySize)
  .then(() => {
    console.log('done')
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
