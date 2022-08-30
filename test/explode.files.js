const fs = require('fs')
const { describe, it, before } = require('mocha')
const { buffersShouldEqual } = require('../src/helpers/testing.js')
const { through, splitAt, transformSplitBy, transformIdentity, streamToBuffer } = require('../src/helpers/stream.js')
const { explode } = require('../src/explode.js')
const { toHex, fileExists } = require('../src/helpers/functions.js')

const TEST_FILE_FOLDER = '../pkware-test-files/'

const defineTestForSimpleFiles = (highWaterMark) => (folder, compressedFile, decompressedFile) => {
  it(`can decompress ${folder}/${compressedFile} with ${toHex(highWaterMark)} byte chunks`, (done) => {
    ;(async () => {
      let expected
      try {
        expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
      } catch (e) {
        done(e)
      }

      if (!expected) {
        return
      }
      fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark })
        .on('error', done)
        .pipe(through(explode({ debug: true })).on('error', done))
        .pipe(
          streamToBuffer((buffer) => {
            buffersShouldEqual(buffer, expected, 0, true)
            done()
          }),
        )
    })()
  })
}

const defineTestForFilesWithOffset = (highWaterMark) => (folder, compressedFile, decompressedFile, offset) => {
  it(`can decompress ${folder}/${compressedFile}`, (done) => {
    ;(async () => {
      let expected
      try {
        expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
      } catch (e) {
        done(e)
      }

      if (!expected) {
        return
      }
      fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark })
        .on('error', done)
        .pipe(
          through(transformSplitBy(splitAt(offset), transformIdentity(), explode({ debug: true }))).on('error', done),
        )
        .pipe(
          streamToBuffer((buffer) => {
            buffersShouldEqual(buffer, expected, 0, false)
            done()
          }),
        )
    })()
  })
}

// only run the tests, if the other repo is present
// https://mochajs.org/#inclusive-tests
before(async function () {
  if (!(await fileExists(TEST_FILE_FOLDER))) {
    this.skip()
  }
})

describe('explode', () => {
  defineTestForSimpleFiles(0x100)('implode-decoder', 'small', 'small.unpacked')
  defineTestForSimpleFiles(0x1000)('implode-decoder', 'small', 'small.unpacked')
  defineTestForSimpleFiles(0x10000)('implode-decoder', 'small', 'small.unpacked')
  /*
  defineTestForSimpleFiles(0x100)('implode-decoder', 'medium', 'medium.unpacked')
  defineTestForSimpleFiles(0x1000)('implode-decoder', 'medium', 'medium.unpacked')
  defineTestForSimpleFiles(0x10000)('implode-decoder', 'medium', 'medium.unpacked')

  defineTestForSimpleFiles(0x100)('implode-decoder', 'large', 'large.unpacked')
  defineTestForSimpleFiles(0x1000)('implode-decoder', 'large', 'large.unpacked')
  defineTestForSimpleFiles(0x10000)('implode-decoder', 'large', 'large.unpacked')

  defineTestForSimpleFiles(0x100)('implode-decoder', 'large.ascii', 'large.unpacked')
  defineTestForSimpleFiles(0x1000)('implode-decoder', 'large.ascii', 'large.unpacked')
  defineTestForSimpleFiles(0x10000)('implode-decoder', 'large.ascii', 'large.unpacked')

  defineTestForSimpleFiles(0x100)('implode-decoder', 'binary', 'binary.unpacked')
  defineTestForSimpleFiles(0x1000)('implode-decoder', 'binary', 'binary.unpacked')
  defineTestForSimpleFiles(0x10000)('implode-decoder', 'binary', 'binary.unpacked')

  defineTestForSimpleFiles(0x100)('arx-fatalis/level8', 'level8.llf', 'level8.llf.unpacked')
  defineTestForSimpleFiles(0x1000)('arx-fatalis/level8', 'level8.llf', 'level8.llf.unpacked')
  defineTestForSimpleFiles(0x10000)('arx-fatalis/level8', 'level8.llf', 'level8.llf.unpacked')
  */

  defineTestForFilesWithOffset(0x100)('arx-fatalis/level8', 'fast.fts', 'fast.fts.unpacked', 0x718)

  /*
  defineTestForFilesWithOffset(0x1000)('arx-fatalis/level8', 'fast.fts', 'fast.fts.unpacked', 0x718)
  defineTestForFilesWithOffset(0x10000)('arx-fatalis/level8', 'fast.fts', 'fast.fts.unpacked', 0x718)

  defineTestForFilesWithOffset(0x100)('arx-fatalis/level8', 'level8.dlf', 'level8.dlf.unpacked', 8520)
  defineTestForFilesWithOffset(0x1000)('arx-fatalis/level8', 'level8.dlf', 'level8.dlf.unpacked', 8520)
  defineTestForFilesWithOffset(0x10000)('arx-fatalis/level8', 'level8.dlf', 'level8.dlf.unpacked', 8520)

  defineTestForFilesWithOffset(0x1000)('arx-fatalis/level4', 'fast.fts', 'fast.fts.unpacked', 0x718)
  defineTestForFilesWithOffset(0x1000)('arx-fatalis/level1', 'level1.dlf', 'level1.dlf.unpacked', 8520)
  */
})
