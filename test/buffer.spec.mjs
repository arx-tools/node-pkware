/* global describe, it */

import assert from 'assert'
import fs from 'fs'
// TODO: watch for new ramda release, 0.28 - https://github.com/ramda/ramda/issues/3038
import { map, sum, length } from '../node_modules/ramda/src/index.mjs'

describe('Buffer', () => {
  it('can be compared to other buffers with equals()', () => {
    const buffer1 = Buffer.from('abc')
    const buffer2 = Buffer.from('abc')
    assert.ok(buffer1.equals(buffer2))
  })

  it('can aggregate chunks of a stream', done => {
    const chunks = []
    fs.createReadStream('test/files/arx-fatalis/level8/fast.fts')
      .on('data', function (d) {
        chunks.push(d)
      })
      .on('end', function () {
        const buffer = Buffer.concat(chunks)
        assert.ok(chunks.length > 1)
        assert.strictEqual(buffer.length, sum(map(length, chunks)))
        done()
      })
  })
})
