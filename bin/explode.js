#!/usr/bin/env node

const fs = require('fs')
const minimist = require('minimist')
const { getPackageVersion, parseNumberString, fileExists } = require('../src/helpers/functions.js')
const { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } = require('../src/helpers/stream.js')
const { explode } = require('../src/explode.js')
// const {
//   COMPRESSION_BINARY,
//   COMPRESSION_ASCII,
//   DICTIONARY_SIZE_SMALL,
//   DICTIONARY_SIZE_MEDIUM,
//   DICTIONARY_SIZE_LARGE
// } = require('../src/constants.js')

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'drop-before-offset', 'debug' /*, 'auto-detect' */],
  alias: {
    v: 'version'
  }
})

const decompress = (input, output, offset, /* autoDetect, */ keepHeader, params) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = explode(params)

  let handler = rightHandler

  // if (autoDetect) {
  //   const everyPkwareHeader = [
  //     Buffer.from([COMPRESSION_BINARY, DICTIONARY_SIZE_SMALL]),
  //     Buffer.from([COMPRESSION_BINARY, DICTIONARY_SIZE_MEDIUM]),
  //     Buffer.from([COMPRESSION_BINARY, DICTIONARY_SIZE_LARGE]),
  //     Buffer.from([COMPRESSION_ASCII, DICTIONARY_SIZE_SMALL]),
  //     Buffer.from([COMPRESSION_ASCII, DICTIONARY_SIZE_MEDIUM]),
  //     Buffer.from([COMPRESSION_ASCII, DICTIONARY_SIZE_LARGE])
  //   ]
  //   handler = transformSplitBy(splitAtMatch(everyPkwareHeader, offset, params.debug), leftHandler, rightHandler)
  // } else if (offset > 0) {
  handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)
  // }

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

;(async () => {
  if (args.version) {
    console.log(await getPackageVersion())
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
  // const autoDetect = args['auto-detect']

  const keepHeader = !args['drop-before-offset']
  const params = {
    debug: args.debug,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x40000)
  }

  decompress(input, output, offset, /* autoDetect, */ keepHeader, params)
    .then(() => {
      process.exit(0)
    })
    .catch(e => {
      console.error(`error: ${e.message}`)
      process.exit(1)
    })
})()
