const { implode } = require('./implode.js')
const { explode } = require('./explode.js')
const constants = require('./constants.js')
const errors = require('./errors.js')

const compress = implode
const decompress = explode

module.exports = {
  implode,
  compress,
  explode,
  decompress,
  constants,
  errors
}
