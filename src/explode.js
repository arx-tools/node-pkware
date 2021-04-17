const { ERROR_INVALID_DATA } = require('./constants')

const readHeader = () => {
  throw new Error(ERROR_INVALID_DATA)
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
