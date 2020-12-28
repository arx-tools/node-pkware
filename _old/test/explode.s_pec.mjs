/* global describe, it */

import assert from 'assert'
import fs from 'fs'
import explode, { parseFirstChunk, generateAsciiTables, generateDecodeTables } from '../src/explode.mjs'
import { ERROR_INVALID_DATA, ERROR_INVALID_DICTIONARY_SIZE } from '../src/constants.mjs'
import { through, transformIdentity, transformSplitBy, splitAtIndex } from '../src/helpers.mjs'
import { readToBuffer, buffersShouldEqual } from './helpers.mjs'

const decompressToBuffer = (fileName, offset = 0, chunkSizeInBytes = 1024) => {
  return new Promise((resolve, reject) => {
    const chunks = []

    const leftHandler = transformIdentity()
    const rightHandler = explode()

    let handler = rightHandler
    if (offset > 0) {
      handler = transformSplitBy(splitAtIndex(offset), leftHandler, rightHandler)
    }

    fs.createReadStream(fileName, { highWaterMark: chunkSizeInBytes })
      .pipe(
        through(handler)
          .on('error', reject)
          .on('data', chunk => {
            chunks.push(chunk)
          })
          .on('finish', function () {
            resolve(Buffer.concat(chunks))
          })
      )
      .on('error', reject)
  })
}

describe('parseFirstChunk', () => {
  it('is a function', () => {
    assert.strictEqual(typeof parseFirstChunk, 'function')
  })

  it('rejects with ERROR_INVALID_DATA, when given buffer is shorter, than 5', async () => {
    await assert.throws(() => parseFirstChunk(Buffer.from([0, 0, 0, 0])), { message: ERROR_INVALID_DATA })
  })

  it('rejects with ERROR_INVALID_DICTIONARY_SIZE, when 2nd byte is not between 4 and 6', async () => {
    await assert.throws(() => parseFirstChunk(Buffer.from([0, 2, 0, 0, 0])), { message: ERROR_INVALID_DICTIONARY_SIZE })
    await assert.throws(() => parseFirstChunk(Buffer.from([0, 8, 0, 0, 0])), { message: ERROR_INVALID_DICTIONARY_SIZE })
  })
})

describe('generateAsciiTables', () => {
  it('is a function', () => {
    assert.strictEqual(typeof generateAsciiTables, 'function')
  })
})

describe('generateDecodeTables', () => {
  it('is a function', () => {
    assert.strictEqual(typeof generateDecodeTables, 'function')
  })
})

describe('explode', () => {
  it('is a function', () => {
    assert.strictEqual(typeof explode, 'function')
  })
  it('can decode files, which have been compressed with ascii mode', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/large.unpacked'),
      decompressToBuffer('test/files/implode-decoder/large.ascii')
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with binary mode', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/binary.unpacked'),
      decompressToBuffer('test/files/implode-decoder/binary')
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with small dictionary size', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/small.unpacked'),
      decompressToBuffer('test/files/implode-decoder/small')
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with medium dictionary size', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/medium.unpacked'),
      decompressToBuffer('test/files/implode-decoder/medium')
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with large dictionary size', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/large.unpacked'),
      decompressToBuffer('test/files/implode-decoder/large')
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which span over multiple chunks', done => {
    Promise.all([
      readToBuffer('test/files/implode-decoder/large.unpacked'),
      decompressToBuffer('test/files/implode-decoder/large', 0, 97)
    ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })

  /*
  describe('arx fatalis', () => {
    // TODO: header size is dynamic, use arx-header-size for other levels
    const level = 8
    it(`can decode DLF file of level ${level}`, done => {
      Promise.all([
        readToBuffer(`test/files/arx-fatalis/level${level}/level${level}.dlf.unpacked`),
        decompressToBuffer(`test/files/arx-fatalis/level${level}/level${level}.dlf`, 8520)
      ])
        .then(([expected, result]) => {
          buffersShouldEqual(expected, result)
        })
        .then(done, done)
    })
    it(`can decode FTS file of level ${level}`, done => {
      Promise.all([
        readToBuffer(`test/files/arx-fatalis/level${level}/fast.fts.unpacked`),
        decompressToBuffer(`test/files/arx-fatalis/level${level}/fast.fts`, 1816)
      ])
        .then(([expected, result]) => {
          buffersShouldEqual(expected, result)
        })
        .then(done, done)
    })
    it(`can decode LLF file of level ${level}`, done => {
      Promise.all([
        readToBuffer(`test/files/arx-fatalis/level${level}/level${level}.llf.unpacked`),
        decompressToBuffer(`test/files/arx-fatalis/level${level}/level${level}.llf`)
      ])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
    })
  })
  */
})
