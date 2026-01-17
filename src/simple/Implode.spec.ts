import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { expect } from 'expect'
import { Implode } from '@src/simple/Implode.js'
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

describe('simple/Implode', () => {
  it('is defined', () => {
    expect(Implode).toBeDefined()
  })

  // it('can compress binary files', async () => {
  //   const level1 = path.resolve(pkwareTestFilesFolder, './arx-fatalis/level1/')

  //   // TODO
  // })
})
