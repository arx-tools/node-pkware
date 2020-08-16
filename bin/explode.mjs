#!/usr/bin/env node --experimental-modules --no-warnings

import fs from 'fs'
import { Transform } from 'stream'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'

const { version } = JSON.parse(fs.readFileSync('./package.json'))

console.log(`node-pkware v.${version}`)

const args = minimist(process.argv.slice(2), {
  string: ['filename']
})

if (!args.filename) {
  console.error('--filename not specified')
  process.exit(1)
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const decompress = filename => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filename)
      .pipe(through(explode()).on('error', reject))
      .pipe(fs.createWriteStream(`${filename}.decompressed`))
      .on('finish', resolve)
      .on('error', reject)
  })
}

decompress(args.filename)
  .then(() => {
    console.log('OK')
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
