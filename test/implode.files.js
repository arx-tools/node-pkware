const fs = require('fs')
const { before, describe, it } = require('mocha')
const { buffersShouldEqual } = require('../src/helpers/testing.js')
const { through, streamToBuffer, transformSplitBy, splitAt, transformIdentity } = require('../src/helpers/stream.js')
const { implode } = require('../src/implode.js')
const { explode } = require('../src/explode.js')
const { toHex, fileExists } = require('../src/helpers/functions.js')
const {
  COMPRESSION_ASCII,
  DICTIONARY_SIZE_SMALL,
  COMPRESSION_BINARY,
  DICTIONARY_SIZE_LARGE,
  DICTIONARY_SIZE_MEDIUM,
} = require('../src/constants.js')

const TEST_FILE_FOLDER = '../pkware-test-files/'

const defineTestForImplodeSelfCheck = (highWaterMark) => {
  return (folder, decompressedFile, compressionType, dictionarySize) => {
    it(`can compress ${folder}/${decompressedFile} with ${toHex(highWaterMark)} byte chunks`, (done) => {
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

        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`, { highWaterMark })
          .on('error', done)
          .pipe(through(implode(compressionType, dictionarySize, { debug: true })))
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
}

const defineTestForImplodeSelfCheckWithOffset = (highWaterMark) => {
  return (folder, decompressedFile, compressionType, dictionarySize, offset) => {
    it(`can compress ${folder}/${decompressedFile} with ${toHex(highWaterMark)} byte chunks and ${toHex(
      offset,
    )} offset`, (done) => {
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

        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`, { highWaterMark })
          .on('error', done)
          .pipe(
            through(
              transformSplitBy(
                splitAt(offset),
                transformIdentity(),
                implode(compressionType, dictionarySize, { debug: true }),
              ),
            ),
          )
          .pipe(
            through(transformSplitBy(splitAt(offset), transformIdentity(), explode({ debug: true }))).on('error', done),
          )
          .pipe(
            streamToBuffer((buffer) => {
              try {
                buffersShouldEqual(buffer, expected, 0, true)
                done()
              } catch (e) {
                done(e)
              }
            }),
          )
      })()
    })
  }
}

/*
const defineTestForSimpleFiles = (highWaterMark) => {
  return (folder, decompressedFile, compressedFile, compressionType, dictionarySize) => {
    it(`can compress ${folder}/${decompressedFile} with ${toHex(highWaterMark)} byte chunks`, done => {
      ;(async () => {
        let expected
        try {
          expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`)
        } catch (e) {
          done(e)
        }

        if (!expected) {
          return
        }
        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`, { highWaterMark })
          .on('error', done)
          .pipe(through(implode(compressionType, dictionarySize, { debug: true })).on('error', done))
          .pipe(
            streamToBuffer(buffer => {
              buffersShouldEqual(buffer, expected, 0, true)
              done()
            })
          )
      })()
    })
  }
}
  */

/*
const defineTestForFilesWithOffset = (highWaterMark) => {
  return (folder, decompressedFile, compressedFile, compressionType, dictionarySize, offset) => {
    it(`can compress ${folder}/${decompressedFile}`, done => {
      ;(async () => {
        let expected
        try {
          const expected = await fs.promises.readFile(`${TEST_FILE_FOLDER}${folder}/${compressedFile}`)
        } catch (e) {
          done(e)
        }

        if (!expected) {
          return
        }
        fs.createReadStream(`${TEST_FILE_FOLDER}${folder}/${decompressedFile}`, { highWaterMark })
          .on('error', done)
          .pipe(
            through(
              transformSplitBy(
                splitAt(offset),
                transformIdentity(),
                implode(compressionType, dictionarySize, { debug: true })
              )
            ).on('error', done)
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
}
  */

// only run the tests, if the other repo is present
// https://mochajs.org/#inclusive-tests
before(async function () {
  if (!(await fileExists(TEST_FILE_FOLDER))) {
    this.skip()
  }
})

describe('implode', () => {
  defineTestForImplodeSelfCheck(0x100)('implode-decoder', 'small.unpacked', COMPRESSION_BINARY, DICTIONARY_SIZE_SMALL)
  defineTestForImplodeSelfCheck(0x1000)('implode-decoder', 'large.unpacked', COMPRESSION_ASCII, DICTIONARY_SIZE_LARGE)

  defineTestForImplodeSelfCheckWithOffset(0x10000)(
    'arx-fatalis/level8',
    'fast.fts.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    0x718,
  )

  defineTestForImplodeSelfCheckWithOffset(0x100)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_SMALL,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x1000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_SMALL,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x10000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_SMALL,
    0,
  )

  defineTestForImplodeSelfCheckWithOffset(0x100)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_MEDIUM,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x1000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_MEDIUM,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x10000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_MEDIUM,
    0,
  )

  defineTestForImplodeSelfCheckWithOffset(0x100)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x1000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    0,
  )
  defineTestForImplodeSelfCheckWithOffset(0x10000)(
    'arx-fatalis/level8',
    'level8.llf.unpacked',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    0,
  )

  // defineTestForImplodeSelfCheck(0x10)('misc', 'uncompressed.txt', COMPRESSION_BINARY, DICTIONARY_SIZE_SMALL)

  /*
  defineTestForSimpleFiles(0x100)(
    'implode-decoder',
    'small.unpacked',
    'small',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_SMALL
  )
  */

  /*
  defineTestForFilesWithOffset(0x100)(
    'arx-fatalis/level8',
    'fast.fts.unpacked',
    'fast.fts',
    COMPRESSION_BINARY,
    DICTIONARY_SIZE_LARGE,
    0x718
  )
  */
})
