import { repeat, mergeRight, clone, last /*, clamp */ } from '../node_modules/ramda/src/index.mjs'
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
  DistBits //,
  // LONGEST_ALLOWED_REPETITION
} from './constants.mjs'
import { nBitsOfOnes, getLowestNBits, toHex } from './helpers.mjs'
import QuasiImmutableBuffer from './QuasiImmutableBuffer.mjs'

const setup = (compressionType, dictionarySize) => {
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
      throw new Error(ERROR_INVALID_DICTIONARY_SIZE)
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
      throw new Error(ERROR_INVALID_COMPRESSION_TYPE)
  }

  let nCount = 0x100
  for (let i = 0; i < 0x10; i++) {
    for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
      state.nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
      state.nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | (LenCode[i] * 2) | 1
      nCount++
    }
  }

  state.initialData = Buffer.from([compressionType, state.dictionarySizeBits, 0])
  state.outBits = 0

  return state
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

/* eslint-disable prefer-const */

/*
const getSizeOfMatching = (inputBytes, a, b) => {
  const limit = clamp(2, LONGEST_ALLOWED_REPETITION, b - a)
  for (let i = 2; i <= limit; i++) {
    if (inputBytes[a + i] !== inputBytes[b + i]) {
      return i
    }
  }

  return limit
}

// TODO: make sure that we find the most recent one, which in turn allows
// us to store backward length in less amount of bits
// currently the code goes from the furthest point
const findRepetitions = (inputBytes, endOfLastMatch, cursor) => {
  if (endOfLastMatch === cursor || cursor - endOfLastMatch < 2) {
    return { size: 0, distance: 0 }
  }

  const haystack = inputBytes.slice(endOfLastMatch, cursor)
  const needle = inputBytes.slice(cursor, cursor + 2)

  const matchIndex = haystack.indexOf(needle)
  if (matchIndex !== -1) {
    const distance = cursor - endOfLastMatch - matchIndex
    return {
      distance: distance - 1,
      size: distance > 2 ? getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor) : 2
    }
  }

  return { size: 0, distance: 0 }
}
*/

let gotFirstTwoBytes = false

const INFINITE_LOOP_THRESHOLD = 100

const processChunkData = (state, debug = false) => {
  if (!state.inputBuffer.isEmpty()) {
    let startIndex = 0

    // repetitions are at least 2 bytes long,
    // so the initial 2 bytes can be moved to the output as is
    if (!gotFirstTwoBytes) {
      gotFirstTwoBytes = true

      const [byte1, byte2] = state.inputBuffer.read(0, 2)
      outputBits(state, state.nChBits[byte1], state.nChCodes[byte1])
      outputBits(state, state.nChBits[byte2], state.nChCodes[byte2])
      startIndex += 2
    }

    // ---------------------------

    // I don't trust my code, so just in case I'm trying to detect infinite loops in the while loop below
    let infLoopProtector = 0
    let previousStartIndex = startIndex

    while (startIndex < state.inputBuffer.size()) {
      // the idea is to detect if the startIndex is not progressing for over INFINITE_LOOP_THRESHOLD times
      if (previousStartIndex === startIndex) {
        if (++infLoopProtector > INFINITE_LOOP_THRESHOLD) {
          console.error('infinite loop detected, halting!')
          process.exit(1)
        }
      } else {
        infLoopProtector = 0
        previousStartIndex = startIndex
      }

      // ---------------------------

      const byte = state.inputBuffer.read(startIndex, 1)
      outputBits(state, state.nChBits[byte], state.nChCodes[byte])
      startIndex += 1
    }

    state.inputBuffer.dropStart(state.inputBuffer.size())

    /*
    
    let endOfLastMatch = 0
    while (startIndex < state.inputBuffer.size()) {
      let { size, distance } = findRepetitions(state.inputBuffer.read(endOfLastMatch), endOfLastMatch, startIndex) // eslint-disable-line prefer-const

      const isRepetitionFlushable = (currentSize, currentDistance) => {
        if (currentSize === 0) {
          return false
        }

        if (currentSize === 2 && currentDistance >= 0x100) {
          return false
        }

        return true
      }

      if (isRepetitionFlushable(size, distance, startIndex)) {
        // let cursor = startIndex
        // let newSize = size
        // let newDistance = distance
        // let currentSize
        // let currentDistance
        // while (newSize <= currentSize && isRepetitionFlushable(newSize, newDistance)) {
        //   currentSize = newSize
        //   currentDistance = newDistance
        //   const reps = findRepetitions(state.inputBuffer.read(endOfLastMatch), endOfLastMatch, ++cursor)
        //   newSize = reps.size
        //   newDistance = reps.distance
        // }
        // size = newSize
        // distance = currentDistance

        endOfLastMatch = startIndex + size

        const byte = size + 0xfe
        outputBits(state, state.nChBits[byte], state.nChCodes[byte])
        if (size === 2) {
          const byte = distance >> 2
          outputBits(state, state.distBits[byte], state.distCodes[byte])
          outputBits(state, 2, distance & 3)
        } else {
          const byte = distance >> state.dictionarySizeBits
          outputBits(state, state.distBits[byte], state.distCodes[byte])
          outputBits(state, state.dictionarySizeBits, state.dictionarySizeMask & distance)
        }
        startIndex += size
      } else {
        const byte = state.inputBuffer.read(startIndex, 1)
        outputBits(state, state.nChBits[byte], state.nChCodes[byte])
        startIndex += 1
      }

      state.inputBuffer.dropStart(endOfLastMatch)
      startIndex -= endOfLastMatch
      endOfLastMatch = 0
    }
    */
  }

  if (state.streamEnded) {
    // Write the termination literal
    outputBits(state, last(state.nChBits), last(state.nChCodes))
  }
}

/* eslint-enable */

const implode = (
  compressionType,
  dictionarySize,
  { debug = false, inputBufferSize = 0x0, outputBufferSize = 0x0 } = {}
) => {
  let state = {
    isFirstChunk: true,
    streamEnded: false,
    compressionType: compressionType,
    dictionarySizeBytes: dictionarySize,
    distCodes: clone(DistCode),
    distBits: clone(DistBits),
    inputBuffer: new QuasiImmutableBuffer(inputBufferSize),
    outputBuffer: new QuasiImmutableBuffer(outputBufferSize),
    onInputFinished: callback => {
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

  return function (chunk, encoding, callback) {
    state.inputBuffer.append(chunk)

    try {
      if (state.isFirstChunk) {
        state.isFirstChunk = false
        this._flush = state.onInputFinished
        const { initialData, ...newState } = setup(compressionType, dictionarySize)
        state = mergeRight(state, newState)
        state.outputBuffer.append(initialData)
      }

      if (debug) {
        console.log(`reading ${toHex(chunk.length)} bytes from chunk #${state.stats.chunkCounter++}`)
      }

      processChunkData(state, debug)

      // output as much whole blocks of 0x800 bytes from the outputBuffer as possible
      const blockSize = 0x800
      const numberOfBytes = Math.floor(state.outputBuffer.size() / blockSize) * blockSize
      const output = Buffer.from(state.outputBuffer.read(0, numberOfBytes))
      state.outputBuffer.flushStart(numberOfBytes)

      if (state.outBits === 0) {
        // set last byte to 0
        state.outputBuffer.dropEnd(1)
        state.outputBuffer.append(Buffer.from([0]))
      }

      callback(null, output)
    } catch (e) {
      callback(e)
    }
  }
}

export default implode
