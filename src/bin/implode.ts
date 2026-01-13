#!/usr/bin/env -S node --enable-source-maps

import process from 'node:process'
import minimist from 'minimist-lite'
import { Compression, DictionarySize } from '@src/constants.js'
import { getPackageVersion, parseNumberString, getInputStream, getOutputStream } from '@bin/helpers.js'
import {
  transformEmpty,
  transformIdentity,
  transformSplitBy,
  splitAt,
  through,
  type StreamHandler,
} from '@src/stream.js'
import { type Config } from '@src/types.js'
import { implode } from '@src/index.js'

type AppArgs = {
  _: string[]
  output?: string
  offset?: string
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
  string: ['output', 'offset'],
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

// eslint-disable-next-line max-params -- I know this has hideously many params, but it's only used here within the bin folder
async function compress(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  offset: number,
  keepHeader: boolean,
  compressionType: Compression,
  dictionarySize: DictionarySize,
  config: Config,
): Promise<void> {
  let leftHandler: StreamHandler
  if (keepHeader) {
    leftHandler = transformIdentity()
  } else {
    leftHandler = transformEmpty()
  }

  const rightHandler = implode(compressionType, dictionarySize, config)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  return new Promise<void>((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

if (args.version) {
  const version = await getPackageVersion()
  console.log(`node-pkware - version ${version}`)
  process.exit(0)
}

let input: NodeJS.ReadableStream
let output: NodeJS.WritableStream
try {
  if (!args.ascii && !args.binary) {
    throw new Error('compression type missing, expected either --ascii or --binary')
  }

  if (args.ascii && args.binary) {
    throw new Error('multiple compression types specified, can only work with either --ascii or --binary')
  }

  if (!args.small && !args.medium && !args.large) {
    throw new Error('dictionary size missing, expected either --small, --medium or --large')
  }

  let numberOfDictionarySizeArguments = 0
  if (args.small) {
    numberOfDictionarySizeArguments = numberOfDictionarySizeArguments + 1
  }

  if (args.medium) {
    numberOfDictionarySizeArguments = numberOfDictionarySizeArguments + 1
  }

  if (args.large) {
    numberOfDictionarySizeArguments = numberOfDictionarySizeArguments + 1
  }

  if (numberOfDictionarySizeArguments > 1) {
    throw new Error('multiple dictionary sizes specified, can only work with either --small, --medium or --large')
  }

  input = await getInputStream(args._[0])
  output = await getOutputStream(args.output)
} catch (error: unknown) {
  console.error('error:', (error as Error).message)
  process.exit(1)
}

let compressionType
if (args.ascii) {
  compressionType = Compression.Ascii
} else {
  compressionType = Compression.Binary
}

let dictionarySize
if (args.small) {
  dictionarySize = DictionarySize.Small
} else if (args.medium) {
  dictionarySize = DictionarySize.Medium
} else {
  dictionarySize = DictionarySize.Large
}

const offset = parseNumberString(args.offset, 0)
const keepHeader = !args['drop-before-offset']
const config: Config = {
  verbose: args.verbose,
}

try {
  await compress(input, output, offset, keepHeader, compressionType, dictionarySize, config)
  process.exit(0)
} catch (error: unknown) {
  console.error('error:', (error as Error).message)
  process.exit(1)
}
