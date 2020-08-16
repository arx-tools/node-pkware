import fs from 'fs'
// import { EOL } from 'os'
import { Transform } from 'stream'
import { implode, ASCII_COMPRESSION, DICTIONARY_SIZE1 } from '../src/index.mjs'

// https://stackoverflow.com/a/27641609/1806628
const CHUNK_SIZE_IN_BYTES = 199
// const CHUNK_SIZE_IN_BYTES = 0x1000

/*
const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}
*/

/*
const turnEveryAtoZ = (chunk, encoding, callback) => {
  callback(null, Buffer.from(Array.from(chunk).map(char => (char === 97 ? 122 : char))))
}
*/

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const test = () => {
  return new Promise((resolve, reject) => {
    fs.createReadStream('./test/files/very-tiny.unpacked', { highWaterMark: CHUNK_SIZE_IN_BYTES })
      // .pipe(through(toConsole))
      // .pipe(through(turnEveryAtoZ))
      .pipe(through(implode(ASCII_COMPRESSION, DICTIONARY_SIZE1)).on('error', reject))
      // .pipe(through(toConsole()))
      .pipe(fs.createWriteStream('E:\\compressed.txt'))
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
