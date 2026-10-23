import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { before, describe, it } from 'node:test'
import { Explode as SimpleExplode } from '../../src/simple/Explode.ts'
import { explode, implode } from '../../src/stream/index.ts'
import { assertTestFilesFolderExists, readFixture, runStream } from '../helpers.ts'

void describe('stream/Implode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const unpackedFile = await readFixture('level1.llf.unpacked')

    console.time('    ⏱ stream/Implode compressed level1.llf.unpacked')
    await runStream(implode('binary', 'large'), unpackedFile, 0x10_00)
    console.timeEnd('    ⏱ stream/Implode compressed level1.llf.unpacked')
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

  void it('can compress the same data repeatedly', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')
    const results: Buffer[] = []

    for (let i = 0; i < 2; i++) {
      results.push(await runStream(implode('binary', 'large'), unpackedFile, 0x10_00))
    }

    assert.ok(results[0].equals(results[1]), 'every repeated run should produce the same bytes')
  })
})
