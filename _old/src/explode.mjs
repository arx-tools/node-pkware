import { repeat, mergeRight, unfold, forEach } from '../node_modules/ramda/src/index.mjs'
import {
  ERROR_INVALID_DATA,
  ERROR_INVALID_DICTIONARY_SIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  ERROR_INVALID_COMPRESSION_TYPE,
  ERROR_ABORTED,
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
} from './constants.mjs'
import { isBetween, getLowestNBits, nBitsOfOnes, toHex } from './helpers.mjs'
import QuasiImmutableBuffer from './QuasiImmutableBuffer.mjs'

const populateAsciiTable = (value, index, bits, target, limit = 0x100) => {
  const seed = n => {
    if (n >= limit) {
      return false
    } else {
      return [n, n + (1 << (value - bits))]
    }
  }
  const idxs = unfold(seed, ChCodeAsc[index] >> bits)

  forEach(idx => {
    target[idx] = index
  }, idxs)

  return value - bits
}

export const generateAsciiTables = () => {
  const state = {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100)
  }

  state.chBitsAsc = ChBitsAsc.map((value, index) => {
    if (value <= 8) {
      return populateAsciiTable(value, index, 0, state.asciiTable2C34)
    }

    const acc = getLowestNBits(8, ChCodeAsc[index])
    if (acc !== 0) {
      state.asciiTable2C34[acc] = 0xff

      if (getLowestNBits(6, ChCodeAsc[index]) === 0) {
        return populateAsciiTable(value, index, 6, state.asciiTable2E34, 0x80)
      } else {
        return populateAsciiTable(value, index, 4, state.asciiTable2D34)
      }
    }

    return populateAsciiTable(value, index, 8, state.asciiTable2EB4)
  })

  return state
}

export const generateDecodeTables = (startIndexes, lengthBits) => {
  return lengthBits.reduce((acc, lengthBit, i) => {
    for (let index = startIndexes[i]; index < 0x100; index += 1 << lengthBit) {
      acc[index] = i
    }

    return acc
  }, repeat(0, 0x100))
}

export const parseFirstChunk = (chunk, debug = false) => {
  if (chunk.length <= 4) {
    throw new Error(ERROR_INVALID_DATA)
  }

  let state = {
    compressionType: chunk.readUInt8(0),
    dictionarySizeBits: chunk.readUInt8(1),
    bitBuffer: chunk.readUInt8(2)
  }

  if (!isBetween(4, 6, state.dictionarySizeBits)) {
    throw new Error(ERROR_INVALID_DICTIONARY_SIZE)
  }

  state.dictionarySizeMask = nBitsOfOnes(state.dictionarySizeBits)

  if (state.compressionType !== BINARY_COMPRESSION) {
    if (state.compressionType !== ASCII_COMPRESSION) {
      throw new Error(ERROR_INVALID_COMPRESSION_TYPE)
    }
    state = mergeRight(state, generateAsciiTables())
  }

  if (debug) {
    console.log(`compression type: ${state.compressionType === BINARY_COMPRESSION ? 'binary' : 'ascii'}`)
    console.log(`compression level: ${state.dictionarySizeBits === 4 ? 1 : state.dictionarySizeBits === 5 ? 2 : 3}`)
  }

  return state
}

const wasteBits = (state, numberOfBits) => {
  if (numberOfBits > state.extraBits && state.inputBuffer.isEmpty()) {
    return PKDCL_STREAM_END
  }

  if (numberOfBits <= state.extraBits) {
    state.bitBuffer = state.bitBuffer >> numberOfBits
    state.extraBits = state.extraBits - numberOfBits
  } else {
    const nextByte = state.inputBuffer.read(0, 1)
    state.inputBuffer.dropStart(1)

    state.bitBuffer = ((state.bitBuffer >> state.extraBits) | (nextByte << 8)) >> (numberOfBits - state.extraBits)
    state.extraBits = state.extraBits + 8 - numberOfBits
  }

  return PKDCL_OK
}

const decodeNextLiteral = state => {
  const lastBit = state.bitBuffer & 1

  if (wasteBits(state, 1) === PKDCL_STREAM_END) {
    return LITERAL_STREAM_ABORTED
  }

  if (lastBit) {
    let lengthCode = state.lengthCodes[getLowestNBits(8, state.bitBuffer)]

    if (wasteBits(state, LenBits[lengthCode]) === PKDCL_STREAM_END) {
      return LITERAL_STREAM_ABORTED
    }

    const extraLenghtBits = ExLenBits[lengthCode]
    if (extraLenghtBits !== 0) {
      const extraLength = getLowestNBits(extraLenghtBits, state.bitBuffer)

      if (wasteBits(state, extraLenghtBits) === PKDCL_STREAM_END && lengthCode + extraLength !== 0x10e) {
        return LITERAL_STREAM_ABORTED
      }

      lengthCode = LenBase[lengthCode] + extraLength
    }

    return lengthCode + 0x100
  } else {
    const lastByte = getLowestNBits(8, state.bitBuffer)

    if (state.compressionType === BINARY_COMPRESSION) {
      return wasteBits(state, 8) === PKDCL_STREAM_END ? LITERAL_STREAM_ABORTED : lastByte
    } else {
      let value
      if (lastByte > 0) {
        value = state.asciiTable2C34[lastByte]

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
  }
}

const decodeDistance = (state, repeatLength) => {
  const distPosCode = state.distPosCodes[getLowestNBits(8, state.bitBuffer)]
  const distPosBits = DistBits[distPosCode]
  if (wasteBits(state, distPosBits) === PKDCL_STREAM_END) {
    return 0
  }

  let distance
  let bitsToWaste

  if (repeatLength === 2) {
    distance = (distPosCode << 2) | getLowestNBits(2, state.bitBuffer)
    bitsToWaste = 2
  } else {
    distance = (distPosCode << state.dictionarySizeBits) | (state.bitBuffer & state.dictionarySizeMask)
    bitsToWaste = state.dictionarySizeBits
  }

  if (wasteBits(state, bitsToWaste) === PKDCL_STREAM_END) {
    return 0
  }

  return distance + 1
}

const processChunkData = state => {
  let nextLiteral
  state.needMoreInput = false

  state.backup()
  nextLiteral = decodeNextLiteral(state)

  while (nextLiteral !== LITERAL_END_STREAM && nextLiteral !== LITERAL_STREAM_ABORTED) {
    let addition
    if (nextLiteral >= 0x100) {
      const repeatLength = nextLiteral - 0xfe
      const minusDistance = decodeDistance(state, repeatLength)
      if (minusDistance === 0) {
        state.needMoreInput = true
        break
      }

      const availableData = state.outputBuffer.read(state.outputBuffer.size() - minusDistance, repeatLength)

      if (repeatLength > minusDistance) {
        const multipliedData = repeat(availableData, Math.ceil(repeatLength / availableData.length))
        addition = Buffer.concat(multipliedData).slice(0, repeatLength)
      } else {
        addition = availableData
      }
    } else {
      addition = Buffer.from([nextLiteral])
    }

    state.outputBuffer.append(addition)

    state.backup()
    nextLiteral = decodeNextLiteral(state)
  }

  if (nextLiteral === LITERAL_STREAM_ABORTED) {
    state.needMoreInput = true
  }

  if (state.needMoreInput) {
    state.restore()
  }
}

const explode = ({ debug = false, inputBufferSize = 0x0, outputBufferSize = 0x0 } = {}) => {
  const stateBackup = {
    extraBits: null,
    bitBuffer: null
  }

  let state = {
    isFirstChunk: true,
    needMoreInput: false,
    chBitsAsc: repeat(0, 0x100), // DecodeLit and GenAscTabs uses this
    lengthCodes: generateDecodeTables(LenCode, LenBits),
    distPosCodes: generateDecodeTables(DistCode, DistBits),
    extraBits: 0,
    inputBuffer: new QuasiImmutableBuffer(inputBufferSize),
    outputBuffer: new QuasiImmutableBuffer(outputBufferSize),
    onInputFinished: callback => {
      if (debug) {
        console.log('---------------')
        console.log('total number of chunks read:', state.stats.chunkCounter)
        console.log('inputBuffer heap size', toHex(state.inputBuffer.heapSize()))
        console.log('outputBuffer heap size', toHex(state.outputBuffer.heapSize()))
      }

      if (state.needMoreInput) {
        callback(new Error(ERROR_ABORTED))
      } else {
        callback(null, state.outputBuffer.read())
      }
    },
    backup: () => {
      stateBackup.extraBits = state.extraBits
      stateBackup.bitBuffer = state.bitBuffer
      state.inputBuffer._saveIndices()
    },
    restore: () => {
      state.extraBits = stateBackup.extraBits
      state.bitBuffer = stateBackup.bitBuffer
      state.inputBuffer._restoreIndices()
    },
    stats: {
      chunkCounter: 0
    }
  }

  return function (chunk, encoding, callback) {
    state.needMoreInput = false
    state.inputBuffer.append(chunk)

    try {
      if (state.isFirstChunk) {
        state.isFirstChunk = false
        this._flush = state.onInputFinished
        state = mergeRight(state, parseFirstChunk(chunk, debug))
        state.inputBuffer.dropStart(3)
      }

      if (debug) {
        console.log(`reading ${toHex(chunk.length)} bytes from chunk #${state.stats.chunkCounter++}`)
      }

      processChunkData(state)

      const blockSize = 0x1000
      const numberOfBytes = Math.floor(state.outputBuffer.size() / blockSize) * blockSize
      const output = Buffer.from(state.outputBuffer.read(0, numberOfBytes))
      state.outputBuffer.flushStart(numberOfBytes)

      callback(null, output)
    } catch (e) {
      callback(e)
    }
  }
}

export default explode
