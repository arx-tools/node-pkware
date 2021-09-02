import { repeat, mergeRight, clone, last /*, clamp */ } from '../node_modules/ramda/src/index.mjs'
import {
  DistCode,
  DistBits //,
  // LONGEST_ALLOWED_REPETITION
} from './constants.mjs'
import { nBitsOfOnes, getLowestNBits, toHex } from './helpers.mjs'

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

    // I don't trust my code, so just to be sure I'm detecting infinite loops in the while loop below
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
