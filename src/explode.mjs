import { repeat, mergeRight } from '../node_modules/ramda/src/index.mjs'
import {
  CMP_BAD_DATA,
  CMP_INVALID_DICTSIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_INVALID_MODE,
  PKDCL_OK,
  PKDCL_STREAM_END,
  ChCodeAsc,
  ChBitsAsc,
  LenBits,
  LenCode,
  ExLenBits,
  LenBase,
  DistBits,
  DistCode,
  CMP_ABORT
} from './common.mjs'
import { isBetween, getLowestNBits, isBufferEmpty, appendByteToBuffer } from './helpers.mjs'

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

    state.inputBuffer = chunk.slice(4)

    resolve(state)
  })
}

const wasteBits = (state, numberOfBits) => {
  if (numberOfBits <= state.extraBits) {
    state.extraBits -= numberOfBits
    state.bitBuffer >>= numberOfBits
    return PKDCL_OK
  }

  state.bitBuffer >>= state.extraBits
  if (isBufferEmpty(state.inputBuffer)) {
    // need more data for state.inputBuffer
    // if (stream ended and no more bytes are coming) {
    return PKDCL_STREAM_END
    // }
  }

  const nextByte = state.inputBuffer.readUInt8(0)
  state.inputBuffer = state.inputBuffer.slice(1)

  state.bitBuffer |= nextByte << 8
  state.bitBuffer >>= numberOfBits - state.extraBits
  state.extraBits = state.extraBits - numberOfBits + 8
  return PKDCL_OK
}

// DecodeLit
const decodeNextLiteral = state => {
  if (state.bitBuffer & 1) {
    if (wasteBits(state, 1) === PKDCL_STREAM_END) {
      return 0x306
    }

    let lengthCode = state.lengthCodes[getLowestNBits(8, state.bitBuffer)]

    if (wasteBits(state, LenBits[lengthCode]) === PKDCL_STREAM_END) {
      return 0x306
    }

    const extraLenghtBits = ExLenBits[lengthCode]
    if (extraLenghtBits !== 0) {
      const extraLength = getLowestNBits(extraLenghtBits, state.bitBuffer)

      if (wasteBits(state, extraLenghtBits) === PKDCL_STREAM_END) {
        if (lengthCode + extraLength !== 0x10e) {
          return 0x306
        }
      }

      lengthCode = LenBase[lengthCode] + extraLength
    }

    return lengthCode + 0x100
  }

  if (wasteBits(state, 1) === PKDCL_STREAM_END) {
    return 0x306
  }

  if (state.compressionType === BINARY_COMPRESSION) {
    const uncompressedByte = getLowestNBits(8, state.bitBuffer)
    return wasteBits(state, 8) === PKDCL_STREAM_END ? 0x306 : uncompressedByte
  }

  let value
  if (getLowestNBits(8, state.bitBuffer)) {
    value = state.asciiTable2C34[getLowestNBits(8, state.bitBuffer)]
    if (value === 0xff) {
      if (getLowestNBits(6, state.bitBuffer)) {
        if (wasteBits(state, 4) === PKDCL_STREAM_END) {
          return 0x306
        }
        value = state.asciiTable2D34[getLowestNBits(8, state.bitBuffer)]
      } else {
        if (wasteBits(state, 6) === PKDCL_STREAM_END) {
          return 0x306
        }
        value = state.asciiTable2E34[getLowestNBits(7, state.bitBuffer)]
      }
    }
  } else {
    if (wasteBits(state, 8) === PKDCL_STREAM_END) {
      return 0x306
    }
    value = state.asciiTable2EB4[getLowestNBits(8, state.bitBuffer)]
  }

  return wasteBits(state, state.chBitsAsc[value]) === PKDCL_STREAM_END ? 0x306 : value
}

// DecodeDist
const decodeDistance = (state, repeatLength) => {}

// Expand
const processChunkData = state => {
  return new Promise((resolve, reject) => {
    let nextLiteral
    let outputBuffer = Buffer.from([])

    while ((nextLiteral = decodeNextLiteral(state)) < 0x305) {
      if (nextLiteral >= 0x100) {
        const repeatLength = nextLiteral - 0xfe
        const minusDistance = decodeDistance(state, repeatLength)
        if (minusDistance === 0) {
          reject(new Error(CMP_ABORT))
          break
        }

        // TODO: finish implementation
      } else {
        outputBuffer = appendByteToBuffer(nextLiteral, outputBuffer)
      }
    }

    resolve(outputBuffer)
  })
}

const explode = () => {
  let state = {
    isFirstChunk: true,
    chBitsAsc: repeat(0, 0x100), // DecodeLit and GenAscTabs uses this
    lengthCodes: generateDecodeTables(LenCode, LenBits),
    distPosCodes: generateDecodeTables(DistCode, DistBits),
    extraBits: 0
  }

  return (chunk, encoding, callback) => {
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      parseFirstChunk(chunk)
        .then(newState => {
          state = mergeRight(state, newState)
          return processChunkData(state)
        })
        .then(outputBuffer => {
          callback(null, outputBuffer)
        })
        .catch(e => {
          callback(e)
        })
    } else {
      state.inputBuffer = Buffer.concat([state.inputBuffer, chunk])
      processChunkData(state)
        .then(outputBuffer => {
          callback(null, outputBuffer)
        })
        .catch(e => {
          callback(e)
        })
    }
  }
}

export default explode

export { generateAsciiTables, parseFirstChunk, generateDecodeTables }
