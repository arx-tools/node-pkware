import { repeat, mergeRight } from '../node_modules/ramda/src/index.mjs'
import {
  CMP_BAD_DATA,
  CMP_INVALID_DICTSIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_INVALID_MODE,
  CMP_ABORT,
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
  LITERAL_STREAM_ABORTED,
  LITERAL_END_STREAM
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
    state.bitBuffer = chunk.readUInt8(2)

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

    state.inputBuffer = chunk.slice(3)

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
    return PKDCL_STREAM_END
  }

  const nextByte = state.inputBuffer.readUInt8(0)
  state.inputBuffer = state.inputBuffer.slice(1)

  state.bitBuffer |= nextByte << 8
  state.bitBuffer >>= numberOfBits - state.extraBits
  state.extraBits += 8 - numberOfBits
  return PKDCL_OK
}

// DecodeLit
const decodeNextLiteral = state => {
  if (state.bitBuffer & 1) {
    if (wasteBits(state, 1) === PKDCL_STREAM_END) {
      return LITERAL_STREAM_ABORTED
    }

    let lengthCode = state.lengthCodes[getLowestNBits(8, state.bitBuffer)]

    if (wasteBits(state, LenBits[lengthCode]) === PKDCL_STREAM_END) {
      return LITERAL_STREAM_ABORTED
    }

    const extraLenghtBits = ExLenBits[lengthCode]
    if (extraLenghtBits !== 0) {
      const extraLength = getLowestNBits(extraLenghtBits, state.bitBuffer)

      if (wasteBits(state, extraLenghtBits) === PKDCL_STREAM_END) {
        if (lengthCode + extraLength !== 0x10e) {
          return LITERAL_STREAM_ABORTED
        }
      }

      lengthCode = LenBase[lengthCode] + extraLength
    }

    return lengthCode + 0x100
  }

  if (wasteBits(state, 1) === PKDCL_STREAM_END) {
    return LITERAL_STREAM_ABORTED
  }

  if (state.compressionType === BINARY_COMPRESSION) {
    const uncompressedByte = getLowestNBits(8, state.bitBuffer)
    return wasteBits(state, 8) === PKDCL_STREAM_END ? LITERAL_STREAM_ABORTED : uncompressedByte
  }

  let value
  if (getLowestNBits(8, state.bitBuffer)) {
    value = state.asciiTable2C34[getLowestNBits(8, state.bitBuffer)]
    if (value === 0xff) {
      if (getLowestNBits(6, state.bitBuffer)) {
        if (wasteBits(state, 4) === PKDCL_STREAM_END) {
          return LITERAL_STREAM_ABORTED
        }
        value = state.asciiTable2D34[getLowestNBits(8, state.bitBuffer)]
      } else {
        if (wasteBits(state, 6) === PKDCL_STREAM_END) {
          return LITERAL_STREAM_ABORTED
        }
        value = state.asciiTable2E34[getLowestNBits(7, state.bitBuffer)]
      }
    }
  } else {
    if (wasteBits(state, 8) === PKDCL_STREAM_END) {
      return LITERAL_STREAM_ABORTED
    }
    value = state.asciiTable2EB4[getLowestNBits(8, state.bitBuffer)]
  }

  return wasteBits(state, state.chBitsAsc[value]) === PKDCL_STREAM_END ? LITERAL_STREAM_ABORTED : value
}

// DecodeDist
const decodeDistance = (state, repeatLength) => {
  const distPosCode = state.distPosCodes[getLowestNBits(8, state.bitBuffer)]
  const distPosBits = DistBits[distPosCode]
  if (wasteBits(state, distPosBits) === PKDCL_STREAM_END) {
    return 0
  }

  let distance

  if (repeatLength === 2) {
    distance = (distPosCode << 2) | getLowestNBits(2, state.bitBuffer)
    if (wasteBits(state, 2) === PKDCL_STREAM_END) {
      return 0
    }
  } else {
    distance = (distPosCode << state.dictionarySizeBits) | (state.bitBuffer & state.dictionarySizeMask)
    if (wasteBits(state, state.dictionarySizeBits) === PKDCL_STREAM_END) {
      return 0
    }
  }

  return distance + 1
}

// Expand
const processChunkData = state => {
  return new Promise((resolve, reject) => {
    let nextLiteral
    state.needModeInput = false
    state.backup()

    while ((nextLiteral = decodeNextLiteral(state)) < LITERAL_END_STREAM) {
      if (nextLiteral >= 0x100) {
        const repeatLength = nextLiteral - 0xfe
        const minusDistance = decodeDistance(state, repeatLength)
        if (minusDistance === 0) {
          state.needModeInput = true
          break
        }

        state.outputBuffer = Buffer.concat([
          state.outputBuffer,
          state.outputBuffer.slice(
            state.outputBuffer.length - minusDistance,
            state.outputBuffer.length - minusDistance + repeatLength
          )
        ])
      } else {
        state.outputBuffer = appendByteToBuffer(nextLiteral, state.outputBuffer)
      }

      state.backup()
    }

    if (nextLiteral === LITERAL_STREAM_ABORTED) {
      state.needModeInput = true
    }

    if (state.needModeInput) {
      state.restore()
    }

    resolve()
  })
}

const explode = () => {
  const stateBackup = {}

  let state = {
    isFirstChunk: true,
    needModeInput: false,
    chBitsAsc: repeat(0, 0x100), // DecodeLit and GenAscTabs uses this
    lengthCodes: generateDecodeTables(LenCode, LenBits),
    distPosCodes: generateDecodeTables(DistCode, DistBits),
    extraBits: 0,
    outputBuffer: Buffer.from([]),
    onInputFinished: callback => {
      if (state.needModeInput) {
        callback(new Error(CMP_ABORT))
      } else {
        callback(null, state.outputBuffer)
      }
    },
    backup: () => {
      stateBackup.extraBits = state.extraBits
      stateBackup.bitBuffer = state.bitBuffer
      stateBackup.inputBuffer = Buffer.concat([state.inputBuffer])
      stateBackup.outputBuffer = Buffer.concat([state.outputBuffer])
    },
    restore: () => {
      state.extraBits = stateBackup.extraBits
      state.bitBuffer = stateBackup.bitBuffer
      state.inputBuffer = stateBackup.inputBuffer
      state.outputBuffer = stateBackup.outputBuffer
    }
  }

  return function (chunk, encoding, callback) {
    state.needModeInput = false

    let work
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      this._flush = state.onInputFinished
      work = parseFirstChunk(chunk).then(newState => {
        state = mergeRight(state, newState)
        return state
      })
    } else {
      state.inputBuffer = Buffer.concat([state.inputBuffer, chunk])
      work = Promise.resolve(state)
    }

    work
      .then(processChunkData)
      .then(() => {
        if (state.outputBuffer.length > 0x1000) {
          const outputBuffer = state.outputBuffer.slice(0, 0x1000)
          state.outputBuffer = state.outputBuffer.slice(0x1000)
          callback(null, outputBuffer)
        } else {
          callback(null, Buffer.from([]))
        }
      })
      .catch(e => {
        callback(e)
      })
  }
}

export default explode

export { generateAsciiTables, parseFirstChunk, generateDecodeTables }
