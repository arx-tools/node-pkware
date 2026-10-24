import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { before, describe, it } from 'node:test'
import { Explode as SimpleExplode } from '../../src/simple/Explode.ts'
import { Implode as SimpleImplode } from '../../src/simple/Implode.ts'
import { explode, implode } from '../../src/stream/index.ts'
import { assertTestFilesFolderExists, measure, readFixture, runStream } from '../helpers.ts'

void describe('stream/Implode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const unpackedFile = await readFixture('level1.llf.unpacked')

    await measure('⏱ stream/Implode compressed level1.llf.unpacked', async () => {
      await runStream(implode('binary', 'large'), unpackedFile, 0x10_00)
    })
  })

  void it('can compress a binary file and unpack it back through the same api', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const compressed = await runStream(implode('binary', 'large'), unpackedFile, 0x10_00)
    const unpacked = await runStream(explode(), Buffer.from(compressed), 0x10_00)

    assert.ok(unpacked.equals(unpackedFile), 'the round trip through the stream api should be lossless')
  })

  void it('can compress a binary file what the simple implementation can unpack', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const compressed = await runStream(implode('binary', 'large'), unpackedFile, 0x10_00)
    // the simple decoder takes an `ArrayBufferLike`, while the stream output is a Buffer (a view over
    // a bigger allocation), so it is copied into an exact array buffer here
    const unpacked = new SimpleExplode(Uint8Array.from(compressed).buffer).getResult()

    assert.ok(unpackedFile.equals(new Uint8Array(unpacked)), 'the simple decoder should read the stream encoder output')
  })

  // the compressed bytes do depend on how the input is split into chunks (the encoder flushes the
  // already used part of its buffer at the chunk boundaries), so only the round trip is guaranteed
  void it('produces a valid stream regardless of how the input is split into chunks', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const singleChunk = await runStream(implode('binary', 'large'), unpackedFile, unpackedFile.length)
    const smallChunks = await runStream(implode('binary', 'large'), unpackedFile, 0x10_00)

    const unpackedSingle = await runStream(explode(), Buffer.from(singleChunk), 0x10_00)
    const unpackedSmall = await runStream(explode(), Buffer.from(smallChunks), 0x10_00)

    assert.ok(unpackedSingle.equals(unpackedFile), 'the single chunk stream should be lossless')
    assert.ok(unpackedSmall.equals(unpackedFile), 'the small chunk stream should be lossless')
  })

  void it('can compress inputs that are shorter than the two leading literals', async () => {
    const matches: boolean[] = []

    for (const size of [0, 1, 2, 3]) {
      const data = Buffer.from([0x0b, 0x30, 0x9f].slice(0, size))

      const compressed = await runStream(implode('binary', 'large'), data, data.length)
      const unpacked = await runStream(explode(), Buffer.from(compressed), 0x10_00)

      matches.push(unpacked.equals(data))
    }

    assert.deepEqual(matches, [true, true, true, true], 'every short input should survive the round trip')
  })

  // the two apis are the same codec, so the compressed bytes have to match as well, otherwise a file
  // compressed through one api could not be recognized as the same file by the other
  void it('produces the same bytes as the simple implementation', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const streamCompressed = await runStream(implode('binary', 'large'), unpackedFile, unpackedFile.length)
    const simpleCompressed = new SimpleImplode(unpackedFile, 'binary', 'large').getResult()

    assert.ok(
      Buffer.from(streamCompressed).equals(Buffer.from(simpleCompressed)),
      'the stream encoder should produce the same bytes as the simple encoder',
    )
  })

  // the encoder drops its input buffer at every chunk boundary, so the lookup table of the match finder
  // must be reset with it, otherwise the stale positions point into the new chunk
  void it('can compress the same data from small chunks and unpack it back', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')
    const matches: boolean[] = []

    for (const chunkSize of [0x1_00, 0x2_00, 0x10_00]) {
      const compressed = await runStream(implode('binary', 'large'), unpackedFile, chunkSize)
      const unpacked = await runStream(explode(), Buffer.from(compressed), 0x10_00)

      matches.push(unpacked.equals(unpackedFile))
    }

    assert.deepEqual(matches, [true, true, true], 'every chunk size should be lossless')
  })

  void it('can compress the same data repeatedly', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')
    const results: Buffer[] = []

    for (let i = 0; i < 2; i++) {
      results.push(await runStream(implode('binary', 'large'), unpackedFile, 0x10_00))
    }

    assert.ok(results[0].equals(results[1]), 'every repeated run should produce the same bytes')
  })
})
