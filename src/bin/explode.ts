#!/usr/bin/env -S node --enable-source-maps

import * as process from 'node:process'
import minimist from 'minimist-lite'
import { getPackageVersion, parseNumberString, getInputStream, getOutputStream } from '@bin/helpers.js'
import {
  transformEmpty,
  transformIdentity,
  transformSplitBy,
  splitAt,
  through,
  type StreamHandler,
} from '@src/stream.js'
import type { Config } from '@src/types.js'
import { explode } from '@src/index.js'

type AppArgs = {
  _: string[]
  output?: string
  offset?: string
  version: boolean
  'drop-before-offset': boolean
  verbose: boolean
  v: boolean
}

const args: AppArgs = minimist(process.argv.slice(2), {
  string: ['output', 'offset'],
  boolean: ['version', 'drop-before-offset', 'verbose'],
  alias: {
    v: 'version',
  },
})

// eslint-disable-next-line max-params -- can't really compress the params further without ruining readability
async function decompress(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  offset: number,
  keepHeader: boolean,
  config: Config,
): Promise<void> {
  let leftHandler: StreamHandler
  if (keepHeader) {
    leftHandler = transformIdentity()
  } else {
    leftHandler = transformEmpty()
  }

  const rightHandler = explode(config)

  const handler = transformSplitBy(splitAt(offset), leftHandler, rightHandler)

  // eslint-disable-next-line @typescript-eslint/return-await -- I'm not gonna rewrite this classic promise nonsense to async/await as I don't know where are the return points exactly
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
}

try {
  await decompress(input, output, offset, keepHeader, config)
  process.exit(0)
} catch (error: unknown) {
  console.error('error:', (error as Error).message)
  process.exit(1)
}
