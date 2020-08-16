#!/usr/bin/env node --experimental-modules --no-warnings

import fs from 'fs'
import minimist from 'minimist'

const { version } = JSON.parse(fs.readFileSync('./package.json'))

console.log(`node-pkware v.${version}`)

const args = minimist(process.argv.slice(2), {
  string: ['filename']
})

if (!args.filename) {
  console.error('--filename not specified')
  process.exit(1)
}
