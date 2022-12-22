#!/usr/bin/env -S node --enable-source-maps

import fs from 'node:fs'
import minimist from 'minimist-lite'
import { Compression, DictionarySize } from '../constants'
import { getPackageVersion, parseNumberString, fileExists } from '../functions'
import { implode } from '../index'
import { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } from '../stream'

const compress = (input, output, offset, keepHeader, compressionType, dictionarySize, config) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = implode(compressionType, dictionarySize, config)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

type AppArgs = {
  _: string[]
  output?: string
  offset?: string
  'input-buffer-size'?: string
  'output-buffer-size'?: string
  version: boolean
  binary: boolean
  ascii: boolean
  'drop-before-offset': boolean
  verbose: boolean
  small: boolean
  medium: boolean
  large: boolean
  v: boolean
  b: boolean
  a: boolean
  s: boolean
  m: boolean
  l: boolean
}

const args: AppArgs = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'ascii', 'binary', 'small', 'medium', 'large', 'drop-before-offset', 'verbose'],
  alias: {
    v: 'version',
    a: 'ascii',
    b: 'binary',
    s: 'small',
    m: 'medium',
    l: 'large',
  },
})

;(async () => {
  if (args.version) {
    const version = await getPackageVersion()
    console.log(`node-pkware - version ${version}`)
    process.exit(0)
  }

  let input = args._[0]

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
  }

  if (!args.ascii && !args.binary) {
    console.error('error: compression type missing, expected either --ascii or --binary')
    hasErrors = true
  }

  const sizes = [args.small, args.medium, args.large].filter((x) => {
    return x === true
  })

  if (sizes.length > 1) {
    console.error('error: multiple size types specified, can only work with one of --small, --medium and --large')
    hasErrors = true
  } else if (sizes.length === 0) {
    console.error('error: size type missing, expected either --small, --medium or --large')
    hasErrors = true
  }

  let output
  if (args.output) {
    output = fs.createWriteStream(args.output)
  } else {
    output = process.stdout
  }

  if (hasErrors) {
    process.exit(1)
  }

  const compressionType = args.ascii ? Compression.Ascii : Compression.Binary
  const dictionarySize = args.small ? DictionarySize.Small : args.medium ? DictionarySize.Medium : DictionarySize.Large

  const offset = parseNumberString(args.offset, 0)

  const keepHeader = !args['drop-before-offset']
  const config = {
    verbose: args.verbose,
    inputBufferSize: parseNumberString(args['input-buffer-size'], 0x10000),
    outputBufferSize: parseNumberString(args['output-buffer-size'], 0x12000),
  }

  compress(input, output, offset, keepHeader, compressionType, dictionarySize, config)
    .then(() => {
      process.exit(0)
    })
    .catch((e) => {
      console.error(`error: ${e.message}`)
      process.exit(1)
    })
})()
