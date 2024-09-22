#!/usr/bin/env -S node --enable-source-maps

import minimist from 'minimist-lite'
import { Compression, DictionarySize } from '../constants.js'
import { getPackageVersion, parseNumberString, getInputStream, getOutputStream } from './helpers.js'
import { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } from '../stream.js'
import { Config } from '../types.js'
import { implode } from '../index.js'

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

const compress = (
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  offset: number,
  keepHeader: boolean,
  compressionType: Compression,
  dictionarySize: DictionarySize,
  config: Config,
) => {
  const leftHandler = keepHeader ? transformIdentity() : transformEmpty()
  const rightHandler = implode(compressionType, dictionarySize, config)

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

    if ((args.small ? 1 : 0) + (args.medium ? 1 : 0) + (args.large ? 1 : 0) > 1) {
      throw new Error('multiple dictionary sizes specified, can only work with either --small, --medium or --large')
    }

    input = await getInputStream(args._[0])
    output = await getOutputStream(args.output)
  } catch (e: unknown) {
    const error = e as Error
    console.error('error:', error.message)
    process.exit(1)
  }

  const compressionType = args.ascii ? Compression.Ascii : Compression.Binary
  const dictionarySize = args.small ? DictionarySize.Small : args.medium ? DictionarySize.Medium : DictionarySize.Large
  const offset = parseNumberString(args.offset, 0)
  const keepHeader = !args['drop-before-offset']
  const config: Config = {
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
