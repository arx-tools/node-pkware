#!/usr/bin/env node

const fs = require('fs')
const minimist = require('minimist')
const {
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  DICTIONARY_SIZE_SMALL,
  DICTIONARY_SIZE_MEDIUM,
  DICTIONARY_SIZE_LARGE
} = require('../src/constants.js')
const { getPackageVersion, parseNumberString, fileExists } = require('../src/helpers/functions.js')
const { implode } = require('../src/implode.js')
const { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } = require('../src/helpers/stream.js')

const decompress = (input, output, offset, keepHeader, compressionType, dictionarySize, params) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = implode(compressionType, dictionarySize, params)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'binary', 'ascii', 'drop-before-offset', 'debug', 'small', 'medium', 'large'],
  alias: {
    a: 'ascii',
    b: 'binary',
    s: 'small',
    m: 'medium',
    l: 'large',
    v: 'version'
  }
})

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
      console.error('error: given file does not exist')
      hasErrors = true
    }
  } else {
    input = process.openStdin()
  }

  if (args.ascii && args.binary) {
    console.error('error: multiple compression types specified, can only work with one of --ascii and --binary')
    hasErrors = true
  } else if (!args.ascii && !args.binary) {
    console.error('error: compression type missing, expected either --ascii or --binary')
    hasErrors = true
  }

  const sizes = [args.small, args.medium, args.large].filter(x => x === true)
  if (sizes.length > 1) {
    console.error('error: multiple size types specified, can only work with one of --small, --medium and --large')
    hasErrors = true
  } else if (sizes.length === 0) {
    console.error('error: size type missing, expected either --small, --medium or --large')
    hasErrors = true
  }

  if (output) {
    output = fs.createWriteStream(output)
  } else {
    output = process.stdout
  }

  if (hasErrors) {
    process.exit(1)
  }

  const compressionType = args.ascii ? ASCII_COMPRESSION : BINARY_COMPRESSION
  const dictionarySize = args.small
    ? DICTIONARY_SIZE_SMALL
    : args.medium
    ? DICTIONARY_SIZE_MEDIUM
    : DICTIONARY_SIZE_LARGE

  const offset = parseNumberString(args.offset, 0)

  const keepHeader = !args['drop-before-offset']
  const params = {
    debug: args.debug,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x12000)
  }

  decompress(input, output, offset, keepHeader, compressionType, dictionarySize, params)
    .then(() => {
      process.exit(0)
    })
    .catch(e => {
      console.error(`error: ${e.message}`)
      process.exit(1)
    })
})()
