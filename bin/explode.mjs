#!/usr/bin/env node --experimental-modules

import fs from 'fs'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'
import { isNil } from '../node_modules/ramda/src/index.mjs'
import { transformSplitByIdx, transformIdentity, through } from '../src/helpers.mjs'
import { fileExists, getPackageVersion } from './helpers.mjs'

const args = minimist(process.argv.slice(2), {
  string: ['output'],
  boolean: ['version']
})

if (args.version) {
  console.log(getPackageVersion())
  process.exit(0)
}

const input = args._[0]

let hasErrors = false

if (!input) {
  console.error('error: --input not specified')
  hasErrors = true
} else if (!fileExists(input)) {
  console.error('error: given file does not exist')
  hasErrors = true
}

if (hasErrors) {
  process.exit(1)
}

if (!args.output) {
  console.warn(`warning: --output not specified, output will be generated to "${input}.decompressed"`)
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

decompress(input, args.output, args.offset)
  .then(() => {
    console.log('done')
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
