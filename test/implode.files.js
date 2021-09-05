const fs = require('fs')
const { before, describe, it } = require('mocha')
const { buffersShouldEqual } = require('../src/helpers/testing.js')
const { through, splitAt, transformSplitBy, transformIdentity, streamToBuffer } = require('../src/helpers/stream.js')
const { implode } = require('../src/implode.js')
const { toHex, fileExists } = require('../src/helpers/functions.js')
const {
  COMPRESSION_ASCII,
  DICTIONARY_SIZE_SMALL,
  COMPRESSION_BINARY,
  DICTIONARY_SIZE_LARGE
} = require('../src/constants.js')

const TEST_FILE_FOLDER = '../pkware-test-files/'

const defineTestForSimpleFiles =
  highWaterMark => (folder, decompressedFile, compressionType, dictionarySize, compressedFile) => {
    it(`can compress ${folder}/${decompressedFile} with ${toHex(highWaterMark)} byte chunks`, done => {
      ;(async () => {
        const expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark })
          .pipe(through(implode(compressionType, dictionarySize, { debug: true })))
          .pipe(
            streamToBuffer(buffer => {
              buffersShouldEqual(buffer, expected, 0, true)
              done()
            })
          )
      })()
    })
  }

const defineTestForFilesWithOffset =
  highWaterMark => (folder, decompressedFile, compressionType, dictionarySize, compressedFile, offset) => {
    it(`can compress ${folder}/${decompressedFile}`, done => {
      ;(async () => {
        const expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`)
        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`, { highWaterMark })
          .pipe(
            through(
              transformSplitBy(
                splitAt(offset),
                transformIdentity(),
                implode(compressionType, dictionarySize, { debug: true })
              )
            )
          )
          .pipe(
            streamToBuffer(buffer => {
              buffersShouldEqual(buffer, expected, 0, false)
              done()
            })
          )
      })()
    })
  }

// only run the tests, if the other repo is present
// https://mochajs.org/#inclusive-tests
before(async function () {
  this.skip() // TODO: remove this once I'm ready to test implode

  if (!(await fileExists(TEST_FILE_FOLDER))) {
    this.skip()
  }
})

describe('implode', () => {
  defineTestForSimpleFiles(0x100)(
    'implode-decoder',
    'small.unpacked',
    COMPRESSION_ASCII,
    DICTIONARY_SIZE_SMALL,
    'small'
  )

  defineTestForFilesWithOffset(0x100)(
    'arx-fatalis/level8',
    'fast.fts.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    'fast.fts',
    0x718
  )
})
