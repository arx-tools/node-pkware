const { has, repeat, clone, last } = require('ramda')
const ExpandingBuffer = require('./helpers/ExpandingBuffer.js')
const { toHex, isFunction, getLowestNBits, nBitsOfOnes } = require('./helpers/functions.js')
const { ExpectedFunctionError, InvalidDictionarySizeError, InvalidCompressionTypeError } = require('./errors.js')
const {
  ChBitsAsc,
  ChCodeAsc,
  DICTIONARY_SIZE_LARGE,
  DICTIONARY_SIZE_MEDIUM,
  DICTIONARY_SIZE_SMALL,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  ExLenBits,
  LenBits,
  LenCode,
  DistCode,
  DistBits
} = require('./constants.js')

const setup = state => {
  state.nChBits = repeat(0, 0x306)
  state.nChCodes = repeat(0, 0x306)

  switch (state.dictionarySizeBits) {
    case DICTIONARY_SIZE_LARGE:
      state.dictionarySizeBits = 6
      state.dictionarySizeMask = nBitsOfOnes(6)
      break
    case DICTIONARY_SIZE_MEDIUM:
      state.dictionarySizeBits = 5
      state.dictionarySizeMask = nBitsOfOnes(5)
      break
    case DICTIONARY_SIZE_SMALL:
      state.dictionarySizeBits = 4
      state.dictionarySizeMask = nBitsOfOnes(4)
      break
    default:
      throw new InvalidDictionarySizeError()
  }

  switch (state.compressionType) {
    case BINARY_COMPRESSION:
      for (let nChCode = 0, nCount = 0; nCount < 0x100; nCount++) {
        state.nChBits[nCount] = 9
        state.nChCodes[nCount] = nChCode
        nChCode = getLowestNBits(16, nChCode) + 2
      }
      break
    case ASCII_COMPRESSION:
      for (let nCount = 0; nCount < 0x100; nCount++) {
        state.nChBits[nCount] = ChBitsAsc[nCount] + 1
        state.nChCodes[nCount] = ChCodeAsc[nCount] * 2
      }
      break
    default:
      throw new InvalidCompressionTypeError()
  }

  let nCount = 0x100
  for (let i = 0; i < 0x10; i++) {
    for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
      state.nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
      state.nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | (LenCode[i] * 2) | 1
      nCount++
    }
  }

  state.outputBuffer.append(Buffer.from([state.compressionType, state.dictionarySizeBits, 0]))
  state.outBits = 0
}

const outputBits = (state, nBits, bitBuffer) => {
  if (nBits > 8) {
    outputBits(state, 8, bitBuffer)
    bitBuffer = bitBuffer >> 8
    nBits = nBits - 8
  }

  const outBits = state.outBits

  // in the original code bitBuffer is long, but is cast to char
  const lastBytes = state.outputBuffer.read(state.outputBuffer.size() - 1, 1)
  state.outputBuffer.dropEnd(1)
  state.outputBuffer.append(Buffer.from([lastBytes | getLowestNBits(8, bitBuffer << outBits)]))

  state.outBits = state.outBits + nBits

  if (state.outBits > 8) {
    bitBuffer = bitBuffer >> (8 - outBits)
    state.outputBuffer.append(Buffer.from([getLowestNBits(8, bitBuffer)]))
    state.outBits = getLowestNBits(3, state.outBits)
  } else {
    state.outBits = getLowestNBits(3, state.outBits)
    if (state.outBits === 0) {
      state.outputBuffer.append(Buffer.from([0]))
    }
  }
}

const processChunkData = (state, debug = false) => {
  if (state.inputBuffer.isEmpty()) {
    return
  }

  if (!has('dictionarySizeMask', state)) {
    setup(state)
  }

  // TODO

  if (state.streamEnded) {
    // Write the termination literal
    outputBits(state, last(state.nChBits), last(state.nChCodes))
  }
}

const implode = (compressionType, dictionarySizeBits, config = {}) => {
  const { debug = false, inputBufferSize = 0x0, outputBufferSize = 0x0 } = config

  const handler = function (chunk, encoding, callback) {
    if (!isFunction(callback)) {
      throw new ExpectedFunctionError()
    }

    const state = handler._state

    try {
      state.inputBuffer.append(chunk)
      if (state.isFirstChunk) {
        state.isFirstChunk = false
        this._flush = state.onInputFinished
      }

      if (debug) {
        console.log(`reading ${toHex(chunk.length)} bytes from chunk #${state.stats.chunkCounter++}`)
      }

      processChunkData(state, debug)

      const blockSize = 0x800
      if (state.outputBuffer.size() > blockSize) {
        const numberOfBytes = (Math.floor(state.outputBuffer.size() / blockSize) - 1) * blockSize
        const output = Buffer.from(state.outputBuffer.read(0, numberOfBytes))
        state.outputBuffer.flushStart(numberOfBytes)

        if (state.outBits === 0) {
          // set last byte to 0
          state.outputBuffer.dropEnd(1)
          state.outputBuffer.append(Buffer.from([0]))
        }

        callback(null, output)
      } else {
        callback(null, Buffer.from([]))
      }
    } catch (e) {
      callback(e)
    }
  }

  handler._state = {
    isFirstChunk: true,
    streamEnded: false,
    compressionType: compressionType,
    dictionarySizeBits: dictionarySizeBits,
    distCodes: clone(DistCode),
    distBits: clone(DistBits),
    inputBuffer: new ExpandingBuffer(inputBufferSize),
    outputBuffer: new ExpandingBuffer(outputBufferSize),
    onInputFinished: callback => {
      const state = handler._state
      state.streamEnded = true
      try {
        processChunkData(state, debug)

        if (debug) {
          console.log('---------------')
          console.log('total number of chunks read:', state.stats.chunkCounter)
          console.log('inputBuffer heap size', toHex(state.inputBuffer.heapSize()))
          console.log('outputBuffer heap size', toHex(state.outputBuffer.heapSize()))
        }

        callback(null, state.outputBuffer.read())
      } catch (e) {
        callback(e)
      }
    },
    stats: {
      chunkCounter: 0
    }
  }

  return handler
}

module.exports = {
  implode
}
