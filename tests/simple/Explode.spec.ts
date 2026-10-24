import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { before, describe, it } from 'node:test'
import { Explode } from '../../src/simple/Explode.ts'
import {
  assertTestFilesFolderExists,
  getHeaderSizeOf,
  measure,
  readArxFixture,
  readDecoderFixture,
} from '../helpers.ts'

void describe('simple/Explode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const packedFile = await readArxFixture('level1/level1.llf')

    await measure('⏱ simple/Explode decompressed level1.llf', () => {
      const explode = new Explode(packedFile.buffer)
      explode.getResult()
    })
  })

  void it('can unpack fully compressed binary files', async () => {
    const packedFile = await readArxFixture('level1/level1.llf')
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')

    const explode = new Explode(packedFile.buffer)
    const unpacked = explode.getResult()

    assert.ok(unpackedReference.equals(new Uint8Array(unpacked)), 'the decompressed data should match the reference')
  })

  void it('can unpack fully compressed binary files when called repeatedly', async () => {
    const packedFile = await readArxFixture('level1/level1.llf')
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')
    const matches: boolean[] = []

    for (let i = 0; i < 5; i++) {
      const explode = new Explode(packedFile.buffer)
      const unpacked = explode.getResult()

      matches.push(unpackedReference.equals(new Uint8Array(unpacked)))
    }

    assert.deepEqual(matches, [true, true, true, true, true], 'every repeated call should match the reference')
  })

  // the ascii (text) compression is not used by arx-fatalis, so this fixture comes from another tool
  void it('can unpack an ascii compressed file', async () => {
    const packedFile = await readDecoderFixture('large.ascii')
    const reference = await readDecoderFixture('large.unpacked')

    const explode = new Explode(packedFile.buffer)
    const unpacked = explode.getResult()

    assert.ok(Buffer.from(unpacked).equals(reference), 'the ascii compressed data should match the reference')
  })

  // the dlf and fts files are partially compressed: the pkware data starts after an uncompressed header
  void it('can unpack a partially compressed dlf file', async () => {
    const packedFile = await readArxFixture('level1/level1.dlf')
    const reference = await readArxFixture('level1/level1.dlf.unpacked')
    const headerSize = getHeaderSizeOf(packedFile, 'dlf')

    const explode = new Explode(packedFile.subarray(headerSize))
    const unpacked = explode.getResult()

    assert.ok(
      Buffer.from(unpacked).equals(reference.subarray(headerSize)),
      'the decompressed data should match the reference after the header',
    )
  })

  void it('can unpack a partially compressed fts file', async () => {
    const packedFile = await readArxFixture('level1/fast.fts')
    const reference = await readArxFixture('level1/fast.fts.unpacked')
    const headerSize = getHeaderSizeOf(packedFile, 'fts')

    const explode = new Explode(packedFile.subarray(headerSize))
    const unpacked = explode.getResult()

    assert.ok(
      Buffer.from(unpacked).equals(reference.subarray(headerSize)),
      'the decompressed data should match the reference after the header',
    )
  })

  // TODO: can unpack partially compressed binary files
})
