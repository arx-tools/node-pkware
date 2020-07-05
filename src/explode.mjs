import { repeat, mergeRight, clone } from '../node_modules/ramda/src/index.mjs'
import {
  CMP_BAD_DATA,
  CMP_INVALID_DICTSIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_INVALID_MODE,
  ChCodeAsc,
  ChBitsAsc,
  LenBits,
  LenCode,
  ExLenBits,
  LenBase,
  DistBits,
  DistCode
} from './common.mjs'
import { isBetween, getLowestNBits } from './helpers.mjs'

const generateAsciiTables = () => {
  const state = {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100)
  }

  state.chBitsAsc = ChBitsAsc.map((value, index) => {
    let acc

    if (value <= 8) {
      acc = ChCodeAsc[index]

      do {
        state.asciiTable2C34[acc] = index
        acc += 1 << value
      } while (acc < 0x100)

      return value
    }

    if (getLowestNBits(8, ChCodeAsc[index]) !== 0) {
      acc = getLowestNBits(8, ChCodeAsc[index])
      state.asciiTable2C34[acc] = 0xff

      if (getLowestNBits(6, ChCodeAsc[index]) !== 0) {
        acc = ChCodeAsc[index] >> 4

        do {
          state.asciiTable2D34[acc] = index
          acc += 1 << (value - 4)
        } while (acc < 0x100)

        return value - 4
      } else {
        acc = ChCodeAsc[index] >> 6

        do {
          state.asciiTable2E34[acc] = index
          acc += 1 << (value - 6)
        } while (acc < 0x80)

        return value - 6
      }
    }

    acc = ChCodeAsc[index] >> 8

    do {
      state.asciiTable2EB4[acc] = index
      acc += 1 << (value - 8)
    } while (acc < 0x100)

    return value - 8
  })

  return state
}

const generateDecodeTables = (startIndexes, lengthBits) => {
  return lengthBits.reduce((acc, lengthBit, i) => {
    for (let index = startIndexes[i]; index < 0x100; index += 1 << lengthBit) {
      acc[index] = i
    }

    return acc
  }, repeat(0, 0x100))
}

const parseFirstChunk = chunk => {
  return new Promise((resolve, reject) => {
    let state = {}

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
      state = mergeRight(state, generateAsciiTables())
    }

    resolve(state)
  })
}

const explode = () => {
  let state = {
    isFirstChunk: true,
    chBitsAsc: repeat(0, 0x100), // DecodeLit and GenAscTabs uses this
    lenBase: clone(LenBase),
    exLenBits: clone(ExLenBits),
    lengthCodes: generateDecodeTables(LenCode, LenBits),
    distPosCodes: generateDecodeTables(DistCode, DistBits)
  }

  return (chunk, encoding, callback) => {
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      parseFirstChunk(chunk)
        .then(newState => {
          state = mergeRight(state, newState)
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

export { generateAsciiTables, parseFirstChunk, generateDecodeTables }
