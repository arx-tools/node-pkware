import { repeat, clone } from '../node_modules/ramda/src/index.mjs'
import {
  CMP_BAD_DATA,
  CMP_INVALID_DICTSIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_INVALID_MODE,
  ChBitsAsc
} from './common.mjs'
import { isBetween } from './helpers.mjs'

const genAscTabs = state => {}

const explode = () => {
  const state = {
    isFirstChunk: true,
    compressionType: null,
    dictionarySizeBits: null,
    dictionarySizeMask: null,
    bitBuffer: null,

    chBitsAsc: repeat(0, 0x100) // ???
  }
  return (chunk, encoding, callback) => {
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      if (chunk.length <= 4) {
        callback(new Error(CMP_BAD_DATA))
        return
      }

      state.compressionType = chunk[0]
      state.dictionarySizeBits = chunk[1]
      state.bitBuffer = chunk.readUIntBE(2, 2)

      if (!isBetween(4, 6, state.dictionarySizeBits)) {
        callback(new Error(CMP_INVALID_DICTSIZE))
        return
      }

      state.dictionarySizeMask = 0xffff >> (0x10 - state.dictionarySizeBits)

      if (state.compressionType !== BINARY_COMPRESSION) {
        if (state.compressionType !== ASCII_COMPRESSION) {
          callback(new Error(CMP_INVALID_MODE))
          return
        }
        state.chBitsAsc = clone(ChBitsAsc)
        genAscTabs(state)
      }

      console.log(state)

      callback(null, chunk)
      return
    }

    callback(null, chunk)
  }
}

export default explode
