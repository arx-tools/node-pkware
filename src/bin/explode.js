#!/usr/bin/env -S node --enable-source-maps

const fs = require('fs')
const minimist = require('minimist-lite')
const { getPackageVersion, parseNumberString, fileExists } = require('../src/helpers/functions')
const { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } = require('../src/helpers/stream')
const { explode } = require('../src/explode')

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'drop-before-offset', 'verbose'],
  alias: {
    v: 'version',
  },
})

const decompress = (input, output, offset, keepHeader, config) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = explode(config)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

;(async () => {
  if (args.version) {
    const version = await getPackageVersion()
    console.log(`node-pkware - version ${version}`)
    process.exit(0)
  }

  let input = args._[0] || args.input
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
  const config = {
    verbose: args.verbose,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x40000),
  }

  decompress(input, output, offset, keepHeader, config)
    .then(() => {
      process.exit(0)
    })
    .catch((e) => {
      console.error(`error: ${e.message}`)
      process.exit(1)
    })
})()
