#!/usr/bin/env node --experimental-modules --no-warnings

import fs from 'fs'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'
import { isNil } from '../node_modules/ramda/src/index.mjs'
import { transformSplitByIdx, transformIdentity, through } from '../src/helpers.mjs'
import { fileExists, getPackageVersion } from './helpers.mjs'

console.log(`node-pkware v.${getPackageVersion()}`)

const args = minimist(process.argv.slice(2), {
  string: ['input', 'output']
})

let hasErrors = false

if (!args.input) {
  console.error('error: --input not specified')
  hasErrors = true
} else if (!fileExists(args.input)) {
  console.error()
}

if (hasErrors) {
  process.exit(1)
}

if (!args.output) {
  console.warn(`warning: --output not specified, output will be generated to "${args.input}.decompressed"`)
}

const decompress = (input, output, offset) => {
  const handler = isNil(offset) ? explode() : transformSplitByIdx(offset, transformIdentity(), explode())

  return new Promise((resolve, reject) => {
    fs.createReadStream(input)
      .pipe(through(handler).on('error', reject))
      .pipe(fs.createWriteStream(output || `${input}.decompressed`))
      .on('finish', resolve)
      .on('error', reject)
  })
}

decompress(args.input, args.output, args.offset)
  .then(() => {
    console.log('done')
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
