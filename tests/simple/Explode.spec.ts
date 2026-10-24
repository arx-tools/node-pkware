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

/**
 * Decompresses a fully compressed file, which is the whole input of the decoder.
 *
 * @param levelAndName The path of the file, for example `level8/level8.llf`.
 * @returns The decompressed bytes and the reference file they should match.
 */
async function decodeFullyCompressedFile(levelAndName: string): Promise<{ unpacked: Buffer; reference: Buffer }> {
  const packedFile = await readArxFixture(levelAndName)
  const reference = await readArxFixture(`${levelAndName}.unpacked`)

  const unpacked = await measure(`⏱ simple/Explode decompressed ${levelAndName}`, () => {
    const explode = new Explode(packedFile)

    return explode.getResult()
  })

  return { unpacked: Buffer.from(unpacked), reference }
}

/**
 * Decompresses the compressed part of a partially compressed file, the uncompressed header is skipped
 * with the size that the `arx-header-size` package reports.
 *
 * @param levelAndName The path of the file, for example `level1/level1.dlf`.
 * @returns The decompressed bytes and the reference file they should match after the header.
 */
async function decodePartiallyCompressedFile(levelAndName: string): Promise<{ unpacked: Buffer; reference: Buffer }> {
  let format: 'dlf' | 'fts' = 'fts'

  if (levelAndName.endsWith('.dlf')) {
    format = 'dlf'
  }

  const packedFile = await readArxFixture(levelAndName)
  const reference = await readArxFixture(`${levelAndName}.unpacked`)
  const headerSize = getHeaderSizeOf(packedFile, format)

  const unpacked = await measure(`⏱ simple/Explode decompressed ${levelAndName}`, () => {
    const explode = new Explode(packedFile.subarray(headerSize))

    return explode.getResult()
  })

  return { unpacked: Buffer.from(unpacked), reference: reference.subarray(headerSize) }
}

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

  // one level would only cover one data distribution and dictionary, so the largest (level7), the
  // smallest (level8) and a medium one (level3) are checked as well
  void it('can unpack the level7 file, which is the largest one', async () => {
    const { unpacked, reference } = await decodeFullyCompressedFile('level7/level7.llf')

    assert.ok(unpacked.equals(reference), 'the level7 data should match the reference')
  })

  void it('can unpack the level8 file, which is the smallest one', async () => {
    const { unpacked, reference } = await decodeFullyCompressedFile('level8/level8.llf')

    assert.ok(unpacked.equals(reference), 'the level8 data should match the reference')
  })

  void it('can unpack the level3 file, which is a medium sized one', async () => {
    const { unpacked, reference } = await decodeFullyCompressedFile('level3/level3.llf')

    assert.ok(unpacked.equals(reference), 'the level3 data should match the reference')
  })

  // the dlf and fts files are partially compressed: the pkware data starts after an uncompressed header
  void it('can unpack a partially compressed dlf file', async () => {
    const { unpacked, reference } = await decodePartiallyCompressedFile('level1/level1.dlf')

    assert.ok(unpacked.equals(reference), 'the decompressed data should match the reference after the header')
  })

  void it('can unpack a partially compressed fts file', async () => {
    const { unpacked, reference } = await decodePartiallyCompressedFile('level1/fast.fts')

    assert.ok(unpacked.equals(reference), 'the decompressed data should match the reference after the header')
  })

  // TODO: can unpack partially compressed binary files
})
