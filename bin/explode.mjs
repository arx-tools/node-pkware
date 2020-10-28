#!/usr/bin/env node --experimental-modules

import fs from 'fs'
import minimist from 'minimist'
import { isNil } from '../node_modules/ramda/src/index.mjs'
import { explode } from '../src/index.mjs'
import { transformSplitByIdx, transformIdentity, through, transformEmpty } from '../src/helpers.mjs'
import { fileExists, getPackageVersion, parseNumberString } from './helpers.mjs'

const decompress = (input, output, offset, keepHeader, params) => {
  const handler = isNil(offset)
    ? explode(params)
    : transformSplitByIdx(offset, keepHeader ? transformIdentity() : transformEmpty(), explode(params))

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'drop-before-offset', 'debug']
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

  const keepHeader = !args['drop-before-offset']
  const params = {
    debug: args.debug,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x40000)
  }

  decompress(input, output, offset, keepHeader, params)
    .then(() => {
      process.exit(0)
    })
    .catch(e => {
      console.error(e)
      process.exit(1)
    })
})()
