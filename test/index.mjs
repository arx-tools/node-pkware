import fs from 'fs'
import { EOL } from 'os'
import through2 from 'through2'
// import { implode, explode } from '../src/index.js'

const toConsole = (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}

const turnEveryAtoZ = function (chunk, encoding, callback) {
  callback(null, Buffer.from(
    Array.from(chunk).map(char => char === 97 ? 122 : char)
  ))
}

const test = () => {
  return new Promise((resolve, reject) => {
    fs.createReadStream('./test/files/small.decomp')
      .pipe(through2(toConsole))
      .pipe(through2(turnEveryAtoZ))
      .pipe(through2(toConsole))
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
