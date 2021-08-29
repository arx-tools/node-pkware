/* global describe, it */

const fs = require('fs')
const { before } = require('mocha')
const { fileExists, streamToBuffer, buffersShouldEqual } = require('../src/helpers/testing.js')
const { through /*, splitAt, transformSplitBy, transformIdentity */ } = require('../src/helpers/stream.js')
const { explode } = require('../src/explode.js')

const TEST_FILE_FOLDER = '../pkware-test-files/'

const defineTestForSimpleFiles = (folder, compressedFile, decompressedFile) => {
  it(`can decompress ${folder}/${compressedFile}`, done => {
    ;(async () => {
      const expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
      fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark: 0x100 })
        .pipe(through(explode()))
        .pipe(
          streamToBuffer(buffer => {
            buffersShouldEqual(buffer, expected, 0, true)
            done()
          })
        )
    })()
  })
}

/*
const defineTestForFilesWithOffset = (folder, compressedFile, decompressedFile, offset) => {
  it(`can decompress ${folder}/${compressedFile}`, done => {
    ;(async () => {
      const expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
      fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark: 0x1000 })
        .pipe(through(transformSplitBy(splitAt(offset), transformIdentity(), explode())))
        .pipe(
          streamToBuffer(buffer => {
            buffersShouldEqual(buffer, expected, 0, false)
            done()
          })
        )
    })()
  })
}
*/

// only run the tests, if the other repo is present
// https://mochajs.org/#inclusive-tests
before(async function () {
  if (!(await fileExists(TEST_FILE_FOLDER))) {
    this.skip()
  }
})

describe('explode', () => {
  defineTestForSimpleFiles('implode-decoder', 'small', 'small.unpacked')
  defineTestForSimpleFiles('implode-decoder', 'medium', 'medium.unpacked')
  defineTestForSimpleFiles('implode-decoder', 'large', 'large.unpacked')
  defineTestForSimpleFiles('implode-decoder', 'binary', 'binary.unpacked')

  // defineTestForFilesWithOffset('arx-fatalis/level8', 'fast.fts', 'fast.fts.unpacked', 0x718)
  // defineTestForFilesWithOffset('arx-fatalis/level8', 'level8.dlf', 'level8.dlf.unpacked', 8520)
})
