import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { expect } from 'expect'
import { Explode } from '@src/simple/Explode.js'
import { fileExists, pathToRepoRoot } from '@bin/helpers.js'

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

describe('simple/Explode', () => {
  it('can unpack fully compressed binary files', async () => {
    expect.assertions(1)

    const packedFile = await fs.readFile(path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf'))
    const unpackedReference = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    console.time('    ⏱ Explode decompressed level1.llf')
    const explode = new Explode()
    const unpacked = explode.handleData(packedFile.buffer)
    console.timeEnd('    ⏱ Explode decompressed level1.llf')

    const equals = unpackedReference.equals(new Uint8Array(unpacked))

    expect(equals).toBe(true)
  })

  // it('can unpack partially compressed binary files', async () => {
  //   // TODO
  // })
})
