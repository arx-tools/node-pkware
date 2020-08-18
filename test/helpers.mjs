import { EOL } from 'os'
import fs from 'fs'
import { through } from '../src/helpers.mjs'

const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}

const readToBuffer = (fileName, chunkSizeInBytes = 1024) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    fs.createReadStream(fileName, { highWaterMark: chunkSizeInBytes })
      .on('error', reject)
      .on('data', chunk => {
        chunks.push(chunk)
      })
      .on('end', function () {
        resolve(Buffer.concat(chunks))
      })
  })
}

export { isPromise, through, toConsole, readToBuffer }
