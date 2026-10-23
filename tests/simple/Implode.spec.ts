import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { before, describe, it } from 'node:test'
import { Explode } from '../../src/simple/Explode.ts'
import { Implode } from '../../src/simple/Implode.ts'
import { assertTestFilesFolderExists, readFixture } from '../helpers.ts'

void describe('simple/Implode', () => {
  before(async () => {
    await assertTestFilesFolderExists()

    const unpackedFile = await readFixture('level1.llf.unpacked')

    console.time('    ⏱ Implode compressed level1.llf.unpacked')
    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    instance.getResult()
    console.timeEnd('    ⏱ Implode compressed level1.llf.unpacked')
  })

  void it('can compress binary files', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    const packed = instance.getResult()

    const explode = new Explode(packed)
    const unpacked = explode.getResult()

    assert.ok(unpackedFile.equals(new Uint8Array(unpacked)), 'the compressed and decompressed data should match')
  })

  void it('makes the file smaller and actually compress the data, not just encode it', async () => {
    const unpackedFile = await readFixture('level1.llf.unpacked')

    const instance = new Implode(unpackedFile.buffer, 'binary', 'large')
    const packed = instance.getResult()

    assert.ok(packed.byteLength < unpackedFile.byteLength, 'the compressed data should be smaller than the original')
  })

  void it('can compress the same data consistently over and over again when called repeatedly', () => {
    const matches: boolean[] = []

    for (let i = 0; i < 4; i++) {
      const data = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(40))

      const implodeInstance = new Implode(data, 'binary', 'large')
      const compressed = implodeInstance.getResult()

      const explode = new Explode(compressed)
      const decompressed = explode.getResult()

      matches.push(Buffer.from(decompressed).equals(data))
    }

    assert.deepEqual(matches, [true, true, true, true], 'every repeated round trip should be stable')
  })
})
