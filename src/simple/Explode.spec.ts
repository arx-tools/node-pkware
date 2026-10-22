import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { before, describe, it } from 'node:test'
import { Explode } from '@src/simple/Explode.js'
import { fileExists, pathToRepoRoot } from '@bin/helpers.js'

/**
 * Expecting the {@link https://github.com/arx-tools/pkware-test-files|pkware-test-files}
 * repo to be on the same level as the node-pkware folder
 */
const pkwareTestFilesFolder = path.resolve(pathToRepoRoot(), '../pkware-test-files/')

void describe('simple/Explode', () => {
  before(async () => {
    if (!(await fileExists(pkwareTestFilesFolder))) {
      throw new Error(
        '"pkware-test-files" not found, download it from https://github.com/arx-tools/pkware-test-files and place it next to your "node-pkware" folder!',
      )
    }

    const packedFile = await fs.readFile(path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf'))

    console.time('    ⏱ Explode decompressed level1.llf')
    const explode = new Explode(packedFile.buffer)
    explode.getResult()
    console.timeEnd('    ⏱ Explode decompressed level1.llf')
  })

  void it('can unpack fully compressed binary files', async () => {
    const packedFile = await fs.readFile(path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf'))
    const unpackedReference = await fs.readFile(
      path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
    )

    const explode = new Explode(packedFile.buffer)
    const unpacked = explode.getResult()

    assert.ok(unpackedReference.equals(new Uint8Array(unpacked)), 'the decompressed data should match the reference')
  })

  void it('can unpack fully compressed binary files when called repeatedly', async () => {
    const matches: boolean[] = []

    for (let i = 0; i < 5; i++) {
      const packedFile = await fs.readFile(path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf'))
      const unpackedReference = await fs.readFile(
        path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/level1.llf.unpacked'),
      )

      const explode = new Explode(packedFile.buffer)
      const unpacked = explode.getResult()

      matches.push(unpackedReference.equals(new Uint8Array(unpacked)))
    }

    assert.deepEqual(matches, [true, true, true, true, true], 'every repeated call should match the reference')
  })

  // TODO: can unpack partially compressed binary files
})
