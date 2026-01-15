import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { expect } from 'expect'
import { Explode } from '@src/simple/Explode.js'
import { pathToRepoRoot } from '@bin/helpers.js'

/**
 * Expecting the {@link https://github.com/arx-tools/pkware-test-files|pkware-test-files}
 * repo to be on the same level as the node-pkware folder
 */
const pkwareTestFilesFolder = path.resolve(pathToRepoRoot(), '../pkware-test-files/')

describe('simple/Explode', () => {
  it('is defined', () => {
    expect(Explode).toBeDefined()
  })

  it('can unpack fully compressed files', async () => {
    expect.assertions(1)

    const level1 = path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/')

    const packedFile = await fs.readFile(path.resolve(level1, './level1.llf'))
    const unpackedReference = await fs.readFile(path.resolve(level1, './level1.llf.unpacked'))

    const explode = new Explode()
    const unpacked = explode.handleData(packedFile.buffer)

    const equals = unpackedReference.equals(new Uint8Array(unpacked))

    expect(equals).toBe(true)
  })
})
