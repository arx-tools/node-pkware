#!/usr/bin/env node --experimental-modules --no-warnings

import fs from 'fs'
import { Transform } from 'stream'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'

const { version } = JSON.parse(fs.readFileSync('./package.json'))

console.log(`node-pkware v.${version}`)

const args = minimist(process.argv.slice(2), {
  string: ['input', 'output']
})

if (!args.input) {
  console.error('error: --input not specified')
  process.exit(1)
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

// TODO: implement --offset
// https://www.alxolr.com/articles/how-to-fork-a-nodejs-stream-into-many-streams
// explode --input=test/files/fast.fts --output=E:/fast.fts.decompressed --offset=1816

const decompress = (input, output, offset) => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(input)
      .pipe(through(explode()).on('error', reject))
      .pipe(fs.createWriteStream(output || `${input}.decompressed`))
      .on('finish', resolve)
      .on('error', reject)
  })
}

decompress(args.input, args.output)
  .then(() => {
    console.log('OK')
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
