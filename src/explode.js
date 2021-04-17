const { InvalidDataError } = require('./errors.js')

const readHeader = () => {
  throw new InvalidDataError()
}

const explode = () => {
  const fn = () => {}

  fn._state = {}

  return fn
}

module.exports = {
  readHeader,
  explode
}
