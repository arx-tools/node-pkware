#!/usr/bin/env node

// typescript does not rewrite the `.ts` extensions of the relative imports in the emitted declaration
// files, only in the javascript output (https://github.com/microsoft/TypeScript/issues/61037). the
// published package only carries `.d.ts` files, so the specifiers have to be rewritten to `.js` here
// as well, otherwise the consumers can not resolve them.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const distFolder = path.resolve(import.meta.dirname, '../dist')
const entries = await readdir(distFolder, { recursive: true })
const declarationFiles = entries.filter((name: string): boolean => {
  return name.endsWith('.d.ts')
})

let changed = 0

for (const declarationFile of declarationFiles) {
  const filePath = path.join(distFolder, declarationFile)
  const source = await readFile(filePath, 'utf8')
  const rewritten = source.replaceAll(/from '(?<path>\.{1,2}\/[^']+)\.ts'/g, "from '$<path>.js'")

  if (rewritten !== source) {
    await writeFile(filePath, rewritten)
    changed = changed + 1
  }
}

console.log(`rewrote the import extensions in ${changed} declaration file(s)`)
