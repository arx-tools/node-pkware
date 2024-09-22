#!/usr/bin/env -S node --enable-source-maps

import process from 'node:process'
import minimist from 'minimist-lite'
import { transformEmpty, transformIdentity, transformSplitBy, splitAt, through } from '@src/stream.js'
import { type Config } from '@src/types.js'
import { explode } from '@src/index.js'
import { getPackageVersion, parseNumberString, getInputStream, getOutputStream } from '@bin/helpers.js'

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

async function decompress(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  offset: number,
  keepHeader: boolean,
  config: Config,
): Promise<void> {
  let leftHandler
  if (keepHeader) {
    leftHandler = transformIdentity()
  } else {
    leftHandler = transformEmpty()
  }

  const rightHandler = explode(config)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  return new Promise((resolve, reject) => {
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
  input = await getInputStream(args._[0])
  output = await getOutputStream(args.output)
} catch (error: unknown) {
  console.error('error:', (error as Error).message)
  process.exit(1)
}

const offset = parseNumberString(args.offset, 0)
const keepHeader = !args['drop-before-offset']
const config: Config = {
  verbose: args.verbose,
  inputBufferSize: parseNumberString(args['input-buffer-size'], 0x1_00_00),
  outputBufferSize: parseNumberString(args['output-buffer-size'], 0x4_00_00),
}

try {
  await decompress(input, output, offset, keepHeader, config)
  process.exit(0)
} catch (error: unknown) {
  console.error('error:', (error as Error).message)
  process.exit(1)
}
