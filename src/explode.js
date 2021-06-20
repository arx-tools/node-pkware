const { repeat, unfold, reduce, has } = require('ramda')
const { isFunction } = require('ramda-adjunct')
const {
  InvalidDataError,
  InvalidCompressionTypeError,
  InvalidDictionarySizeError,
  ExpectedBufferError,
  ExpectedFunctionError,
  AbortedError
} = require('./errors.js')
const { isBetween, mergeSparseArrays, getLowestNBits, nBitsOfOnes } = require('./helpers/functions.js')
const {
  ChBitsAsc,
  ChCodeAsc,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  PKDCL_OK,
  PKDCL_STREAM_END,
  LITERAL_STREAM_ABORTED,
  LITERAL_END_STREAM,
  LenBits,
  LenBase,
  ExLenBits,
  DistBits,
  LenCode,
  DistCode
} = require('./constants.js')
const ExpandingBuffer = require('./helpers/ExpandingBuffer.js')

const readHeader = buffer => {
  if (!Buffer.isBuffer(buffer)) {
    throw new ExpectedBufferError()
  }
  if (buffer.length < 4) {
    throw new InvalidDataError()
  }
  if (buffer.readUInt8(0) !== BINARY_COMPRESSION && buffer.readUInt8(0) !== ASCII_COMPRESSION) {
    throw new InvalidCompressionTypeError()
  }
  if (!isBetween(4, 6, buffer.readUInt8(1))) {
    throw new InvalidDictionarySizeError()
  }
  return {
    compressionType: buffer.readUInt8(0),
    dictionarySizeBits: buffer.readUInt8(1)
  }
}

// PAT = populate ascii table
const createPATIterator = (limit, stepper) => n => {
  return n >= limit ? false : [n, n + (1 << stepper)]
}

const populateAsciiTable = (value, index, bits, limit) => {
  const iterator = createPATIterator(limit, value - bits)
  const seed = ChCodeAsc[index] >> bits
  const idxs = unfold(iterator, seed)

  return reduce(
    (acc, idx) => {
      acc[idx] = index
      return acc
    },
    [],
    idxs
  )
}

const generateAsciiTables = () => {
  const tables = {
    asciiTable2C34: repeat(0, 0x100),
    asciiTable2D34: repeat(0, 0x100),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x100)
  }

  tables.chBitsAsc = ChBitsAsc.map((value, index) => {
    if (value <= 8) {
      tables.asciiTable2C34 = mergeSparseArrays(populateAsciiTable(value, index, 0, 0x100), tables.asciiTable2C34)
      return value - 0
    }

    const acc = getLowestNBits(8, ChCodeAsc[index])
    if (acc === 0) {
      tables.asciiTable2EB4 = mergeSparseArrays(populateAsciiTable(value, index, 8, 0x100), tables.asciiTable2EB4)
      return value - 8
    }

    tables.asciiTable2C34[acc] = 0xff

    if (getLowestNBits(6, ChCodeAsc[index]) === 0) {
      tables.asciiTable2E34 = mergeSparseArrays(populateAsciiTable(value, index, 6, 0x80), tables.asciiTable2E34)
      return value - 6
    }

    tables.asciiTable2D34 = mergeSparseArrays(populateAsciiTable(value, index, 4, 0x100), tables.asciiTable2D34)
    return value - 4
  })

  return tables
}

const parseInitialData = state => {
  if (state.inputBuffer.size() < 4) {
    return
  }

  const { compressionType, dictionarySizeBits } = readHeader(state.inputBuffer.read())

  state.compressionType = compressionType
  state.dictionarySizeBits = dictionarySizeBits
  state.bitBuffer = state.inputBuffer.read(2, 1)
  state.inputBuffer.dropStart(3)
  state.dictionarySizeMask = nBitsOfOnes(dictionarySizeBits)

  if (compressionType === ASCII_COMPRESSION) {
    const tables = generateAsciiTables()
    Object.entries(tables).forEach(([key, value]) => {
      state[key] = value
    })
  }
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
  if (state.inputBuffer.isEmpty()) {
    return
  }

  if (!has('compressionType', state)) {
    parseInitialData(state)
    return
  }

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

const generateDecodeTables = (startIndexes, lengthBits) => {
  return lengthBits.reduce((acc, lengthBit, i) => {
    for (let index = startIndexes[i]; index < 0x100; index += 1 << lengthBit) {
      acc[index] = i
    }

    return acc
  }, repeat(0, 0x100))
}

const explode = () => {
  const handler = function (chunk, encoding, callback) {
    if (!isFunction(callback)) {
      throw new ExpectedFunctionError()
    }

    const state = handler._state
    state.needMoreInput = true

    try {
      state.inputBuffer.append(chunk)
      if (state.isFirstChunk) {
        state.isFirstChunk = false
        this._flush = state.onInputFinished
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

  handler._state = {
    _backup: {
      extraBits: null,
      bitBuffer: null
    },
    needMoreInput: true,
    isFirstChunk: true,
    extraBits: 0,
    chBitsAsc: repeat(0, 0x100), // DecodeLit and GenAscTabs uses this
    lengthCodes: generateDecodeTables(LenCode, LenBits),
    distPosCodes: generateDecodeTables(DistCode, DistBits),
    inputBuffer: new ExpandingBuffer(),
    outputBuffer: new ExpandingBuffer(),
    onInputFinished: callback => {
      const state = handler._state
      if (state.needMoreInput) {
        callback(new AbortedError())
      } else {
        callback(null, state.outputBuffer.read())
      }
    },
    backup: () => {
      const state = handler._state
      state._backup.extraBits = state.extraBits
      state._backup.bitBuffer = state.bitBuffer
      state.inputBuffer._saveIndices()
    },
    restore: () => {
      const state = handler._state
      state.extraBits = state._backup.extraBits
      state.bitBuffer = state._backup.bitBuffer
      state.inputBuffer._restoreIndices()
    }
  }

  return handler
}

module.exports = {
  readHeader,
  explode,
  createPATIterator,
  populateAsciiTable,
  generateAsciiTables,
  processChunkData,
  wasteBits,
  decodeNextLiteral,
  decodeDistance,
  generateDecodeTables
}
