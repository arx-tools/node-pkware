import { repeat, clone, clamp, toHex, getLowestNBits, nBitsOfOnes, last } from './functions'
import { ExpandingBuffer } from './ExpandingBuffer'
import {
  ChBitsAsc,
  ChCodeAsc,
  LONGEST_ALLOWED_REPETITION,
  Compression,
  DictionarySize,
  ExLenBits,
  LenBits,
  LenCode,
  DistCode,
  DistBits,
} from './constants'
import { InvalidDictionarySizeError, InvalidCompressionTypeError } from './errors'

export const setup = (state) => {
  state.nChBits = repeat(0, 0x306)
  state.nChCodes = repeat(0, 0x306)

  switch (state.dictionarySizeBits) {
    case DictionarySize.Large:
      state.dictionarySizeMask = nBitsOfOnes(6)
      break
    case DictionarySize.Medium:
      state.dictionarySizeMask = nBitsOfOnes(5)
      break
    case DictionarySize.Small:
      state.dictionarySizeMask = nBitsOfOnes(4)
      break
    default:
      throw new InvalidDictionarySizeError()
  }

  switch (state.compressionType) {
    case Compression.Binary:
      for (let nChCode = 0, nCount = 0; nCount < 0x100; nCount++) {
        state.nChBits[nCount] = 9
        state.nChCodes[nCount] = nChCode
        nChCode = getLowestNBits(16, nChCode) + 2
      }
      break
    case Compression.Ascii:
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

export const outputBits = (state, nBits, bitBuffer) => {
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

// ---------------------------------

export const getSizeOfMatching = (inputBytes, a, b) => {
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
export const findRepetitions = (inputBytes: number[], endOfLastMatch, cursor) => {
  const notEnoughBytes = inputBytes.length - cursor < 2
  const tooClose = cursor === endOfLastMatch || cursor - endOfLastMatch < 2
  if (notEnoughBytes || tooClose) {
    return { size: 0, distance: 0 }
  }

  const haystack = inputBytes.slice(endOfLastMatch, cursor)
  const needle = inputBytes.slice(cursor, cursor + 2)

  const matchIndex = haystack.indexOf(needle)
  if (matchIndex !== -1) {
    const distance = cursor - endOfLastMatch - matchIndex
    return {
      distance: distance - 1,
      size: distance > 2 ? getSizeOfMatching(inputBytes, endOfLastMatch + matchIndex, cursor) : 2,
    }
  }

  return { size: 0, distance: 0 }
}

// this function can return:
//   false - not flushable
//   true - flushable
//   null - flushable, but there might be a better repetition
export const isRepetitionFlushable = (size, distance, startIndex, inputBufferSize) => {
  if (size === 0) {
    return false
  }

  // If we found repetition of 2 bytes, that is 0x100 or fuhrter back,
  // don't bother. Storing the distance of 0x100 bytes would actually
  // take more space than storing the 2 bytes as-is.
  if (size === 2 && distance >= 0x100) {
    return false
  }

  if (size >= 8 || startIndex + 1 >= inputBufferSize) {
    return true
  }

  return null
}

// ---------------------------------

// repetitions are at least 2 bytes long,
// so the initial 2 bytes can be moved to the output as is
export const handleFirstTwoBytes = (state) => {
  if (state.handledFirstTwoBytes) {
    return
  }

  if (state.inputBuffer.size() < 3) {
    return
  }

  const [byte1, byte2] = state.inputBuffer.read(0, 2)
  outputBits(state, state.nChBits[byte1], state.nChCodes[byte1])
  outputBits(state, state.nChBits[byte2], state.nChCodes[byte2])

  state.handledFirstTwoBytes = true
  state.startIndex += 2
}

export const processChunkData = (state, verbose = false) => {
  if (!('dictionarySizeMask' in state)) {
    setup(state)
  }

  if (!state.inputBuffer.isEmpty()) {
    state.startIndex = 0

    handleFirstTwoBytes(state)

    // -------------------------------

    /* eslint-disable prefer-const */

    let endOfLastMatch = 0 // used when searching for longer repetitions later
    while (state.startIndex < state.inputBuffer.size()) {
      let { size, distance } = findRepetitions(state.inputBuffer.read(endOfLastMatch), endOfLastMatch, state.startIndex)

      let isFlushable = isRepetitionFlushable(size, distance, state.startIndex, state.inputBuffer.size())

      if (isFlushable === false) {
        const byte = state.inputBuffer.read(state.startIndex, 1)
        outputBits(state, state.nChBits[byte], state.nChCodes[byte])
        state.startIndex += 1
      } else {
        if (isFlushable === null) {
          /*
          // Try to find better repetition 1 byte later.
          // stormlib/implode.c L517
          let cursor = state.startIndex
          let newSize = size
          let newDistance = distance
          let currentSize
          let currentDistance
          while (newSize <= currentSize && isRepetitionFlushable(newSize, newDistance, state.startIndex, state.inputBuffer.size())) {
            currentSize = newSize
            currentDistance = newDistance
            const reps = findRepetitions(state.inputBuffer.read(endOfLastMatch), endOfLastMatch, ++cursor)
            newSize = reps.size
            newDistance = reps.distance
          }
          size = newSize
          distance = currentDistance
          */
        }

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

        state.startIndex += size
      }

      /*
      state.inputBuffer.dropStart(endOfLastMatch)
      state.startIndex -= endOfLastMatch
      endOfLastMatch = 0
      */

      if (state.dictionarySizeBits === DictionarySize.Small && state.startIndex >= 0x400) {
        state.inputBuffer.dropStart(0x400)
        state.startIndex -= 0x400
      } else if (state.dictionarySizeBits === DictionarySize.Medium && state.startIndex >= 0x800) {
        state.inputBuffer.dropStart(0x800)
        state.startIndex -= 0x800
      } else if (state.dictionarySizeBits === DictionarySize.Large && state.startIndex >= 0x1000) {
        state.inputBuffer.dropStart(0x1000)
        state.startIndex -= 0x1000
      }
    }

    /* eslint-enable prefer-const */

    // -------------------------------

    state.inputBuffer.dropStart(state.inputBuffer.size())
  }

  if (state.streamEnded) {
    // Write the termination literal
    outputBits(state, last(state.nChBits), last(state.nChCodes))
  }
}

export const implode = (compressionType, dictionarySizeBits, config = {}) => {
  const { verbose = false, inputBufferSize = 0x0, outputBufferSize = 0x0 } = config

  const handler = function (chunk, encoding, callback) {
    const state = handler._state

    try {
      state.inputBuffer.append(chunk)

      if (state.isFirstChunk) {
        state.isFirstChunk = false
        this._flush = state.onInputFinished
      }

      if (verbose) {
        console.log(`implode: reading ${toHex(chunk.length)} bytes from chunk #${state.stats.chunkCounter++}`)
      }

      processChunkData(state, verbose)

      const blockSize = 0x800

      if (state.outputBuffer.size() <= blockSize) {
        callback(null, Buffer.from([]))
        return
      }

      const numberOfBytes = (Math.floor(state.outputBuffer.size() / blockSize) - 1) * blockSize
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

  handler._state = {
    isFirstChunk: true,
    streamEnded: false,
    compressionType,
    dictionarySizeBits,
    distCodes: clone(DistCode),
    distBits: clone(DistBits),
    startIndex: 0,
    inputBuffer: new ExpandingBuffer(inputBufferSize),
    outputBuffer: new ExpandingBuffer(outputBufferSize),
    handledFirstTwoBytes: false,
    onInputFinished: (callback) => {
      const state = handler._state
      state.streamEnded = true
      try {
        processChunkData(state, verbose)

        if (verbose) {
          console.log('---------------')
          console.log('implode: total number of chunks read:', state.stats.chunkCounter)
          console.log('implode: inputBuffer heap size', toHex(state.inputBuffer.heapSize()))
          console.log('implode: outputBuffer heap size', toHex(state.outputBuffer.heapSize()))
        }

        callback(null, state.outputBuffer.read())
      } catch (e) {
        callback(e)
      }
    },
    stats: {
      chunkCounter: 0,
    },
  }

  return handler
}