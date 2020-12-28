import implode from './implode.mjs'
import explode from './explode.mjs'
import {
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  DICTIONARY_SIZE1,
  DICTIONARY_SIZE2,
  DICTIONARY_SIZE3
} from './constants.mjs'

// aliases
const compress = implode
const decompress = explode

export {
  implode,
  explode,
  compress,
  decompress,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  DICTIONARY_SIZE1,
  DICTIONARY_SIZE2,
  DICTIONARY_SIZE3
}
