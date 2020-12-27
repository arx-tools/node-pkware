import { repeat, mergeRight, clone, last, clamp } from '../node_modules/ramda/src/index.mjs'
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
  DistBits,
  LONGEST_ALLOWED_REPETITION
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
  if (repetitionMatchLimiter > 0 && cursor === 6659 - 0x1000) {
    console.log(endOfLastMatch + 0x1000, cursor + 0x1000)
    console.log(haystack)
    console.log('                 ', inputBytes.slice(cursor, cursor + 20))
    const distance = cursor - endOfLastMatch - matchIndex
    console.log(distance, distance > 2 ? getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor) : 2)
  }
  if (matchIndex !== -1) {
    const distance = cursor - endOfLastMatch - matchIndex
    return {
      distance: distance - 1,
      size: distance > 2 ? getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor) : 2
    }
  }

  return { size: 0, distance: 0 }
}

let repetitionMatchLimiter = 9000
const processChunkData = (state, debug = false) => {
  if (state.inputBuffer.size() > 0x1000 || state.streamEnded) {
    state.needMoreInput = false

    let infLoopProtector = 100
    let endOfLastMatch
    while (!state.inputBuffer.isEmpty()) {
      if (--infLoopProtector <= 0) {
        console.error('infinite loop detected, halting!')
        process.exit(1)
      }

      const inputBytes = state.inputBuffer.read(0, state.dictionarySizeBytes)

      let byte = inputBytes[0]
      outputBits(state, state.nChBits[byte], state.nChCodes[byte])
      byte = inputBytes[1]
      outputBits(state, state.nChBits[byte], state.nChCodes[byte])

      let startIndex = 2
      endOfLastMatch = 0
      while (startIndex < inputBytes.length) {
        const { size, distance } = findRepetitions(inputBytes, endOfLastMatch, startIndex)

        // TODO: remove side effects
        const isRepetitionFlushable = () => {
          if (size === 0) {
            return false
          }

          if (size === 2 && distance >= 0x100) {
            return false
          }

          // if (size >= 8) {
          //   return true
          // }

          // TODO: try to find a better repetition 1 byte later

          return true
        }

        if (repetitionMatchLimiter-- > 0 && isRepetitionFlushable()) {
          // console.log(`${endOfLastMatch}..${startIndex}`, size, distance)
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
          const byte = inputBytes[startIndex]
          outputBits(state, state.nChBits[byte], state.nChCodes[byte])
          startIndex += 1
        }
      }

      state.inputBuffer.dropStart(inputBytes.length)
    }
  }

  if (state.streamEnded) {
    // Write the termination literal
    outputBits(state, last(state.nChBits), last(state.nChCodes))
  } else {
    state.needMoreInput = true
  }
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

        console.log('\n', repetitionMatchLimiter)
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
