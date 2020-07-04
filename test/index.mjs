import fs from 'fs'
// import { EOL } from 'os'
import { Transform } from 'stream'
import { explode } from '../src/index.mjs'

/*
const toConsole = (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}

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
    fs.createReadStream('./test/files/small')
      // .pipe(through(toConsole))
      // .pipe(through(turnEveryAtoZ))
      // .pipe(through(toConsole))
      .pipe(through(explode()))
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
