const { Transform } = require('stream')

const splitAt = index => {
  let cntr = 0

  if (!Number.isInteger(index) || index < 0) {
    return () => {
      return null
    }
  }

  return chunk => {
    let left
    let right

    if (!Buffer.isBuffer(chunk)) {
      return null
    }

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = Buffer.from([])
      right = chunk
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = Buffer.from([])
    } else {
      // cntr ..... index ..... chunk.length
      left = chunk.slice(0, index - cntr)
      right = chunk.slice(index - cntr)
    }

    cntr += chunk.length
    return [left, right]
  }
}

const transformIdentity = () => {
  return function (chunk, encoding, callback) {
    callback(null, chunk)
  }
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

module.exports = {
  splitAt,
  transformIdentity,
  through
}
