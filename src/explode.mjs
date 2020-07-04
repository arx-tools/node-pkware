import { repeat, mergeRight, clone } from '../node_modules/ramda/src/index.mjs'
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

const parseFirstChunk = chunk => {
  return new Promise((resolve, reject) => {
    const state = {}

    if (chunk.length <= 4) {
      reject(new Error(CMP_BAD_DATA))
      return
    }

    state.compressionType = chunk.readUInt8(0)
    state.dictionarySizeBits = chunk.readUInt8(1)
    state.bitBuffer = chunk.readUIntBE(2, 2)

    if (!isBetween(4, 6, state.dictionarySizeBits)) {
      reject(new Error(CMP_INVALID_DICTSIZE))
      return
    }

    state.dictionarySizeMask = 0xffff >> (0x10 - state.dictionarySizeBits)

    if (state.compressionType !== BINARY_COMPRESSION) {
      if (state.compressionType !== ASCII_COMPRESSION) {
        reject(new Error(CMP_INVALID_MODE))
        return
      }
      state.chBitsAsc = clone(ChBitsAsc)
      genAscTabs(state)
    }

    resolve(state)
  })
}

const explode = () => {
  let state = {
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
      parseFirstChunk(chunk)
        .then(newState => {
          state = mergeRight(state, newState)
          console.log(state)
          callback(null, chunk)
        })
        .catch(e => {
          callback(e)
        })
    } else {
      callback(null, chunk)
    }
  }
}

export default explode

export { genAscTabs, parseFirstChunk }
