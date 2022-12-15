const { implode } = require('./implode')
const { explode } = require('./explode')
const constants = require('./constants')
const errors = require('./errors')
const stream = require('./helpers/stream')

const compress = implode
const decompress = explode

module.exports = {
  implode,
  compress,
  explode,
  decompress,
  constants,
  errors,
  stream,
}
