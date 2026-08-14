import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Buffer } from 'node:buffer'
import { expect } from 'expect'
import { Implode } from '@src/simple/Implode.js'
import { fileExists, pathToRepoRoot } from '@bin/helpers.js'
import { Explode } from '@src/simple/Explode.js'

/**
 * Expecting the {@link https://github.com/arx-tools/pkware-test-files|pkware-test-files}
 * repo to be on the same level as the node-pkware folder
 */
const pkwareTestFilesFolder = path.resolve(pathToRepoRoot(), '../pkware-test-files/')

before(async () => {
  if (!(await fileExists(pkwareTestFilesFolder))) {
    throw new Error(
      '"pkware-test-files" not found, download it from https://github.com/arx-tools/pkware-test-files and place it next to your "node-pkware" folder!',
    )
  }
})

describe('simple/Implode', () => {
  before(async () => {
    const unpackedFile = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    console.time('    ⏱ Implode compressed level1.llf.unpacked')
    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    instance.getResult()
    console.timeEnd('    ⏱ Implode compressed level1.llf.unpacked')
  })

  it('can compress binary files', async () => {
    expect.assertions(1)

    const unpackedFile = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    const packed = instance.getResult()

    const explode = new Explode(packed)
    const unpacked = explode.getResult()

    const equals = unpackedFile.equals(new Uint8Array(unpacked))

    expect(equals).toBe(true)
  })

  it('makes the file smaller and actually compress the data, not just encode it', async () => {
    expect.assertions(1)

    const unpackedFile = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    const packed = instance.getResult()

    expect(packed.byteLength).toBeLessThan(unpackedFile.byteLength)
  })

  it('can compress the same data consistently over and over again when called repeatedly', () => {
    for (let i = 0; i < 4; i++) {
      const data = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(40))

      const implodeInstance = new Implode(data, 'binary', 'large')
      const compressed = implodeInstance.getResult()

      const explode = new Explode(compressed)
      const decompressed = explode.getResult()

      expect(Buffer.from(decompressed).equals(data)).toBe(true)
    }
  })
})
