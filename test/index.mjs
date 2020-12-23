import fs from 'fs'
import { implode, BINARY_COMPRESSION, DICTIONARY_SIZE3 } from '../src/index.mjs'
import { through } from '../src/helpers.mjs'

// https://stackoverflow.com/a/27641609/1806628
const CHUNK_SIZE_IN_BYTES = 1024

/*
const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}
*/

const test = () => {
  return new Promise((resolve, reject) => {
    fs.createReadStream('./test/files/binary.unpacked', { highWaterMark: CHUNK_SIZE_IN_BYTES })
      // .pipe(through(toConsole))
      .pipe(through(implode(BINARY_COMPRESSION, DICTIONARY_SIZE3, { debug: true })).on('error', reject))
      // .pipe(through(toConsole()))
      .pipe(fs.createWriteStream('E:\\binary.repacked'))
      .on('finish', resolve)
      .on('error', reject)
  })
}

test()
  .then(() => {
    console.log('OK')
  })
  .catch(e => {
    console.error('Something happened!', e)
  })
