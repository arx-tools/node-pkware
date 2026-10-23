import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { Explode } from '../../src/simple/Explode.ts'
import { assertTestFilesFolderExists, readFixture } from '../helpers.ts'

void describe('simple/Explode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const packedFile = await readFixture('level1.llf')

    console.time('    ⏱ Explode decompressed level1.llf')
    const explode = new Explode(packedFile.buffer)
    explode.getResult()
    console.timeEnd('    ⏱ Explode decompressed level1.llf')
  })

  void it('can unpack fully compressed binary files', async () => {
    const packedFile = await readFixture('level1.llf')
    const unpackedReference = await readFixture('level1.llf.unpacked')

    const explode = new Explode(packedFile.buffer)
    const unpacked = explode.getResult()

    assert.ok(unpackedReference.equals(new Uint8Array(unpacked)), 'the decompressed data should match the reference')
  })

  void it('can unpack fully compressed binary files when called repeatedly', async () => {
    const packedFile = await readFixture('level1.llf')
    const unpackedReference = await readFixture('level1.llf.unpacked')
    const matches: boolean[] = []

    for (let i = 0; i < 5; i++) {
      const explode = new Explode(packedFile.buffer)
      const unpacked = explode.getResult()

      matches.push(unpackedReference.equals(new Uint8Array(unpacked)))
    }

    assert.deepEqual(matches, [true, true, true, true, true], 'every repeated call should match the reference')
  })

  // TODO: can unpack partially compressed binary files
})
