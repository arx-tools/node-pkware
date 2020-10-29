import { repeat, mergeRight, clone, last } from '../node_modules/ramda/src/index.mjs'
import {
  DICTIONARY_SIZE1,
  DICTIONARY_SIZE2,
  DICTIONARY_SIZE3,
  ERROR_INVALID_DICTIONARY_SIZE,
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  ERROR_INVALID_COMPRESSION_TYPE,
  ChBitsAsc,
  ChCodeAsc,
  ExLenBits,
  LenBits,
  LenCode,
  DistCode,
  DistBits
} from './constants.mjs'
import { nBitsOfOnes, getLowestNBits, toHex } from './helpers.mjs'
import QuasiImmutableBuffer from './QuasiImmutableBuffer.mjs'

// const LONGEST_ALLOWED_REPETITION = 0x204

const setup = (compressionType, dictionarySize) => {
  return new Promise((resolve, reject) => {
    const state = {
      nChBits: repeat(0, 0x306),
      nChCodes: repeat(0, 0x306)
    }

    switch (dictionarySize) {
      case DICTIONARY_SIZE3:
        state.dictionarySizeBits = 6
        state.dictionarySizeMask = nBitsOfOnes(6)
        break
      case DICTIONARY_SIZE2:
        state.dictionarySizeBits = 5
        state.dictionarySizeMask = nBitsOfOnes(5)
        break
      case DICTIONARY_SIZE1:
        state.dictionarySizeBits = 4
        state.dictionarySizeMask = nBitsOfOnes(4)
        break
      default:
        reject(new Error(ERROR_INVALID_DICTIONARY_SIZE))
        return
    }

    switch (compressionType) {
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
        reject(new Error(ERROR_INVALID_COMPRESSION_TYPE))
        return
    }

    let nCount = 0x100
    for (let i = 0; i < 0x10; i++) {
      for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
        state.nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
        state.nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | ((LenCode[i] & 0xffff00ff) * 2) | 1
        nCount++
      }
    }

    state.chunk = Buffer.from([compressionType, state.dictionarySizeBits, 0])
    state.outBits = 0

    resolve(state)
  })
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

const findRepetitions = state => {
  return 0
}

const processChunkData = (state, debug = false) => {
  return new Promise((resolve, reject) => {
    if (state.inputBuffer.size() > 0x1000 || state.streamEnded) {
      state.needMoreInput = false

      if (state.streamEnded && state.inputBuffer.isEmpty()) {
        // need to wrap up writing bytes, just add final literal
      }

      // to prevent infinite loops:
      // depending on the length of chunks the inputBuffer can be over 0x1000 multiple times
      // will try reading the input buffer in 0x1000 blocks, but bail out after 1000 cycles
      let maxCycles = 1000
      const blockSize = 0x1000

      while (maxCycles-- > 0 && (!state.inputBuffer.isEmpty() || !state.streamEnded)) {
        let bytesToSkip = 0
        const inputBytes = Array.from(state.inputBuffer.read(0, blockSize))
        inputBytes.forEach(byte => {
          if (bytesToSkip-- > 0) {
            return
          }

          const foundRepetition = false

          const repetitionSize = findRepetitions(state)
          bytesToSkip += repetitionSize

          if (!foundRepetition) {
            outputBits(state, state.nChBits[byte], state.nChCodes[byte])
          }
        })

        state.inputBuffer.dropStart(inputBytes.length)
      }
    }

    if (state.streamEnded) {
      outputBits(state, last(state.nChBits), last(state.nChCodes))
    } else {
      state.needMoreInput = true
    }

    resolve()
  })
}

const implode = (
  compressionType,
  dictionarySize,
  { debug = false, inputBufferSize = 0x0, outputBufferSize = 0x0 } = {}
) => {
  let state = {
    isFirstChunk: true,
    needMoreInput: true, // TODO: not sure, if we need this flag
    streamEnded: false,
    phase: 0,
    compressionType: compressionType,
    dictionarySizeBytes: dictionarySize,
    distCodes: clone(DistCode),
    distBits: clone(DistBits),
    inputBuffer: new QuasiImmutableBuffer(inputBufferSize),
    outputBuffer: new QuasiImmutableBuffer(outputBufferSize),
    onInputFinished: callback => {
      state.streamEnded = true
      processChunkData(state, debug)
        .then(() => {
          if (debug) {
            console.log('---------------')
            console.log('total number of chunks read:', state.stats.chunkCounter)
            console.log('inputBuffer heap size', toHex(state.inputBuffer.heapSize()))
            console.log('outputBuffer heap size', toHex(state.outputBuffer.heapSize()))
          }
          callback(null, state.outputBuffer.read())
        })
        .catch(e => {
          callback(e)
        })
    },
    stats: {
      chunkCounter: 0
    }
  }

  return function (chunk, encoding, callback) {
    let work
    state.inputBuffer.append(chunk)
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      this._flush = state.onInputFinished
      work = setup(compressionType, dictionarySize).then(({ chunk, ...newState }) => {
        state = mergeRight(state, newState)
        state.outputBuffer.append(chunk)
        return state
      })
    } else {
      work = Promise.resolve(state)
    }

    if (debug) {
      console.log(`reading ${toHex(chunk.length)} bytes from chunk #${state.stats.chunkCounter++}`)
    }

    work
      .then(state => processChunkData(state, debug))
      .then(() => {
        const blockSize = 0x800
        const numberOfBytes = Math.floor(state.outputBuffer.size() / blockSize) * blockSize
        const output = Buffer.from(state.outputBuffer.read(0, numberOfBytes))
        state.outputBuffer.flushStart(numberOfBytes)

        if (state.outBits === 0) {
          state.outputBuffer.dropEnd(1)
          state.outputBuffer.append(Buffer.from([0]))
        }

        callback(null, output)
      })
      .catch(e => {
        callback(e)
      })
  }
}

export default implode
