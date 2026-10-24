import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { before, describe, it } from 'node:test'
import { Implode as SimpleImplode } from '../../src/simple/Implode.ts'
import { explode } from '../../src/stream/index.ts'
import { assertTestFilesFolderExists, measure, readDecoderFixture, readArxFixture, runStream } from '../helpers.ts'

void describe('stream/Explode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const packedFile = await readArxFixture('level1/level1.llf')

    await measure('⏱ stream/Explode decompressed level1.llf', async () => {
      await runStream(explode(), packedFile, packedFile.length)
    })
  })

  void it('can unpack a fully compressed binary file', async () => {
    const packedFile = await readArxFixture('level1/level1.llf')
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')

    const unpacked = await runStream(explode(), packedFile, packedFile.length)

    assert.ok(unpacked.equals(unpackedReference), 'the decompressed data should match the reference')
  })

  void it('can unpack a fully compressed binary file from small chunks', async () => {
    const packedFile = await readArxFixture('level1/level1.llf')
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')

    const unpacked = await runStream(explode(), packedFile, 0x10_00)

    assert.ok(unpacked.equals(unpackedReference), 'the chunked decompression should match the reference')
  })

  void it('can unpack the same data repeatedly', async () => {
    const packedFile = await readArxFixture('level1/level1.llf')
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')
    const matches: boolean[] = []

    for (let i = 0; i < 4; i++) {
      const unpacked = await runStream(explode(), packedFile, 0x10_00)
      matches.push(unpacked.equals(unpackedReference))
    }

    assert.deepEqual(matches, [true, true, true, true], 'every repeated run should match the reference')
  })

  // the ascii (text) compression is not used by arx-fatalis, so the fixture comes from another tool
  void it('can unpack an ascii compressed file', async () => {
    const packedFile = await readDecoderFixture('large.ascii')
    const reference = await readDecoderFixture('large.unpacked')

    const unpacked = await runStream(explode(), packedFile, 0x10_00)

    assert.ok(unpacked.equals(reference), 'the stream decoder should read the ascii compressed file')
  })

  void it('can unpack what the simple implementation compressed', async () => {
    const unpackedReference = await readArxFixture('level1/level1.llf.unpacked')
    const compressed = new SimpleImplode(unpackedReference, 'binary', 'large').getResult()

    const unpacked = await runStream(explode(), Buffer.from(compressed), 0x10_00)

    assert.ok(unpacked.equals(unpackedReference), 'the stream decoder should read the simple encoder output')
  })
})
