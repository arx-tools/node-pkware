import * as fs from 'node:fs/promises'
import * as path from 'node:path'
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
  it('can compress binary files', async () => {
    expect.assertions(1)

    const unpackedFile = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    console.time('    ⏱ Implode compressed level1.llf.unpacked')
    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    const packed = instance.getResult()
    console.timeEnd('    ⏱ Implode compressed level1.llf.unpacked')

    const explode = new Explode()
    const unpacked = explode.handleData(packed)

    const equals = unpackedFile.equals(new Uint8Array(unpacked))

    expect(equals).toBe(true)
  }).timeout(10_000) // TODO: Implode takes 5+ seconds to compress level1.llf, it needs to be improved

  // it('makes the file smaller and actually compress the data, not just encode it', async () => {
  //   expect.assertions(1)

  //   const unpackedFile = await fs.readFile(
  //     path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
  //   )

  //   const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
  //   const packed = instance.getResult()

  //   expect(packed.byteLength).toBeLessThan(unpackedFile.byteLength)
  // }).timeout(10_000) // TODO: Implode takes 5+ seconds to compress level1.llf, it needs to be improved
})
