import { Transform } from 'stream'
import { EOL } from 'os'

const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const toConsole = () => (chunk, encoding, callback) => {
  process.stdout.write(chunk)
  process.stdout.write(Buffer.from(EOL))
  callback(null, chunk)
}

export { isPromise, through, toConsole }
