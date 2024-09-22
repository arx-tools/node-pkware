#!/usr/bin/env -S node --enable-source-maps

import minimist from 'minimist-lite'
import { getPackageVersion, parseNumberString, getInputStream, getOutputStream } from './helpers.js'
import { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } from '../stream.js'
import { Config } from '../types.js'
import { explode } from '../index.js'

type AppArgs = {
  _: string[]
  output?: string
  offset?: string
  'input-buffer-size'?: string
  'output-buffer-size'?: string
  version: boolean
  'drop-before-offset': boolean
  verbose: boolean
  v: boolean
}

const args: AppArgs = minimist(process.argv.slice(2), {
  string: ['output', 'offset', 'input-buffer-size', 'output-buffer-size'],
  boolean: ['version', 'drop-before-offset', 'verbose'],
  alias: {
    v: 'version',
  },
})

const decompress = (
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  offset: number,
  keepHeader: boolean,
  config: Config,
) => {
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

  let input: NodeJS.ReadableStream
  let output: NodeJS.WritableStream
  try {
    input = await getInputStream(args._[0])
    output = await getOutputStream(args.output)
  } catch (e: unknown) {
    const error = e as Error
    console.error('error:', error.message)
    process.exit(1)
  }

  const offset = parseNumberString(args.offset, 0)
  const keepHeader = !args['drop-before-offset']
  const config: Config = {
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
