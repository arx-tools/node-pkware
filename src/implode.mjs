import {
  repeat,
  mergeRight,
  clone,
  last,
  dropLast,
  aperture,
  countBy,
  identity,
  map,
  compose,
  reduce,
  head,
  tail,
  append
} from '../node_modules/ramda/src/index.mjs'
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
import { nBitsOfOnes, getLowestNBits, toHex, projectOver } from './helpers.mjs'
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

const bytePairHash = ([byte0, byte1]) => {
  return byte0 * 4 + byte1 * 5
}

const createPairHashes = inputBytes => {
  return compose(map(bytePairHash), aperture(2))(inputBytes)
}

const countPairHashes = pairHashes => {
  return compose(projectOver(repeat(0, 0x900)), countBy(identity))(pairHashes)
}

const quantifyPairHashes = pairHashes => {
  return reduce(
    (acc, amount) => {
      return append(last(acc) + amount, acc)
    },
    [head(pairHashes)],
    tail(pairHashes)
  )
}

const sortBuffer = (state, inputBytes) => {
  const pairHashes = createPairHashes(inputBytes)
  state.pairHashIndices = compose(quantifyPairHashes, countPairHashes)(pairHashes)
  state.pairHashOffsets = repeat(0, 2 * 0x1000 + LONGEST_ALLOWED_REPETITION)

  for (let i = pairHashes.length - 1; i >= 0; i--) {
    state.pairHashOffsets[--state.pairHashIndices[pairHashes[i]]] = i
  }
}

let infLoopCntrForFindRepetitions = 0
const infiniteLoopWarningLimit = 100

/* eslint-disable prefer-const */
const findRepetitions = (state, inputBytes, startIndex, debug = false) => {
  const returnData = {
    size: 0,
    distance: null
  }

  // Calculate the previous position of the PAIR_HASH
  let pairHashIndex = bytePairHash(inputBytes.slice(startIndex, startIndex + 2))
  let pairHashOffsetIndex = state.pairHashIndices[pairHashIndex]
  let pairHashOffset = state.pairHashOffsets[pairHashOffsetIndex]
  let lowestPairHashOffset = Math.floor(startIndex / 2)

  // If the PAIR_HASH offset is below the limit, find a next one
  if (pairHashOffset < lowestPairHashOffset) {
    let original = pairHashOffset

    while (pairHashOffset < lowestPairHashOffset) {
      pairHashIndex++
      pairHashOffsetIndex = state.pairHashIndices[pairHashIndex]
      pairHashOffset = state.pairHashOffsets[pairHashOffsetIndex]
    }

    state.pairHashIndices[pairHashIndex] = pairHashOffsetIndex
    if (debug && pairHashOffset === undefined) {
      console.warn('\nfindRepetition() tried to access an invalid pairHashOffset address:', {
        lowest: lowestPairHashOffset,
        original: original
      })
    }
  }

  // Get the first location of the PAIR_HASH,
  // and thus the first eventual location of byte repetition
  let prevRepetitionIndex = pairHashOffset
  let repetitionLimitIndex = startIndex - 1

  // If the current PAIR_HASH was not encountered before,
  // we haven't found a repetition.
  if (prevRepetitionIndex >= repetitionLimitIndex) {
    return returnData
  }

  // for debugging:
  const originalPrevRepetitionIndex = prevRepetitionIndex

  // We have found a match of a PAIR_HASH. Now we have to make sure
  // that it is also a byte match, because PAIR_HASH is not unique.
  // We compare the bytes and count the length of the repetition
  let inputDataPtr = startIndex
  let equalByteCount
  let repLength = 1
  let infLoopProtector = 1000
  for (;;) {
    // If the first byte of the repetition and the so-far-last byte
    // of the repetition are equal, we will compare the blocks.
    if (
      inputBytes[inputDataPtr] === inputBytes[prevRepetitionIndex] &&
      inputBytes[inputDataPtr + repLength - 1] === inputBytes[prevRepetitionIndex + repLength - 1]
    ) {
      // Skip the current byte
      prevRepetitionIndex++
      inputDataPtr++
      equalByteCount = 2

      // Now count how many more bytes are equal
      while (equalByteCount < LONGEST_ALLOWED_REPETITION) {
        prevRepetitionIndex++
        inputDataPtr++

        // Are the bytes different ?
        if (inputBytes[inputDataPtr] !== inputBytes[prevRepetitionIndex]) {
          break
        }

        equalByteCount++
      }

      // If we found a repetition of at least the same length, take it.
      // If there are multiple repetitions in the input buffer, this will
      // make sure that we find the most recent one, which in turn allows
      // us to store backward length in less amount of bits
      inputDataPtr = startIndex
      if (equalByteCount >= repLength) {
        // Calculate the backward distance of the repetition.
        // Note that the distance is stored as decremented by 1
        returnData.distance = startIndex - prevRepetitionIndex + equalByteCount - 1

        // Repetitions longer than 10 bytes will be stored in more bits,
        // so they need a bit different handling
        repLength = equalByteCount
        if (repLength > 10) {
          break
        }
      }
    }

    // Move forward in the table of PAIR_HASH repetitions.
    // There might be a more recent occurence of the same repetition.
    pairHashIndex++
    pairHashOffsetIndex = state.pairHashIndices[pairHashIndex]
    pairHashOffset = state.pairHashOffsets[pairHashOffsetIndex]
    prevRepetitionIndex = pairHashOffset

    // If the next repetition is beyond the minimum allowed repetition, we are done.
    if (prevRepetitionIndex >= startIndex) {
      // A repetition must have at least 2 bytes, otherwise it's not worth it
      returnData.size = repLength >= 2 ? repLength : 0
      return returnData
    }

    // TODO: remove this, when the algorithm is working
    if (--infLoopProtector <= 0) {
      infLoopCntrForFindRepetitions++
      if (debug) {
        if (infLoopCntrForFindRepetitions <= infiniteLoopWarningLimit) {
          const left = [inputBytes[startIndex], inputBytes[startIndex + 1]]
          const right = [inputBytes[originalPrevRepetitionIndex], inputBytes[originalPrevRepetitionIndex + 1]]

          const dump = data => {
            return `<${data.map(x => toHex(x, 2, true)).join(' ')}>`
          }

          let log = '\n'

          if (prevRepetitionIndex === undefined) {
            log += ' * infinite loop!'
          } else {
            log += '   infinite loop!'
          }

          log += `[${toHex(startIndex, 3)}] = ${dump(left)} (${toHex(bytePairHash(left), 3, true)})`
          log += left[0] === right[0] ? ' === ' : ' =/= '
          log += `[${
            originalPrevRepetitionIndex === undefined ? 'undefined' : toHex(originalPrevRepetitionIndex, 3)
          }] = ${right[0] === undefined ? '<?? ??>' : `${dump(right)} (${toHex(bytePairHash(right), 3, true)})`}`
          log += ` | repLength = ${repLength}`

          console.log(log)
        }

        if (infLoopCntrForFindRepetitions === infiniteLoopWarningLimit) {
          console.log(' ┖- subsequent warnings for infinite loops within findRepetitions() will not be printed')
        }
      }
      break
    }
  }

  return returnData
}
/* eslint-enable */

const processChunkData = (state, debug = false) => {
  if (state.inputBuffer.size() > 0x1000 || state.streamEnded) {
    state.needMoreInput = false

    let infLoopProtector = 1000
    while (--infLoopProtector >= 0 && !(state.inputBuffer.isEmpty() && state.streamEnded)) {
      // const bytesToSkip = 0

      // should point to what is intially pWork->work_buff + pWork->dsize_bytes + 0x204 in the C code
      // to pWork->work_buff + pWork->dsize_bytes + 0x204 + total_loaded
      const inputBytes = Array.from(state.inputBuffer.read(0, state.dictionarySizeBytes))

      // TODO: where to store the part between pWork->work_buff and pWork->work_buff + pWork->dsize_bytes + LONGEST_ALLOWED_REPETITION?

      switch (state.phase) {
        case 0:
          if (state.streamEnded) {
            sortBuffer(state, inputBytes)
          } else {
            sortBuffer(state, dropLast(LONGEST_ALLOWED_REPETITION, inputBytes))
          }
          state.phase += state.dictionarySizeBytes === 0x1000 ? 1 : 2
          break
        case 1:
          if (state.streamEnded) {
            /*
            tmp = {
              pWork->work_buff + LONGEST_ALLOWED_REPETITION + LONGEST_ALLOWED_REPETITION,
              pWork->work_buff + dsize_bytes + LONGEST_ALLOWED_REPETITION + total_loaded
            }
            */
          } else {
            /*
            tmp = {
              pWork->work_buff + LONGEST_ALLOWED_REPETITION + LONGEST_ALLOWED_REPETITION,
              pWork->work_buff + dsize_bytes + total_loaded
            }
            */
          }
          // sortBuffer(state, tmp)
          state.phase++
          break
        default:
          if (state.streamEnded) {
            /*
            tmp = {
              pWork->work_buff + LONGEST_ALLOWED_REPETITION,
              pWork->work_buff + dsize_bytes + LONGEST_ALLOWED_REPETITION + total_loaded
            }
            */
          } else {
            /*
            tmp = {
              pWork->work_buff + LONGEST_ALLOWED_REPETITION,
              pWork->work_buff + dsize_bytes + total_loaded
            }
            */
          }
          // sortBuffer(state, tmp)
          break
      }

      let inputBytesIdx = 0
      while (inputBytesIdx < inputBytes.length - 1) {
        const { size, distance } = findRepetitions(state, inputBytes, inputBytesIdx, debug)

        if (debug && size > 0) {
          /*
          const currentAddress = `0x${inputBytesIdx.toString(16)}`
          const repetitionAddress = `0x${(inputBytesIdx - distance - 1).toString(16)}`
          console.log(`found ${size} bytes of repetition for ${currentAddress} at ${repetitionAddress}`)
          */
        }
        state.distance = distance

        inputBytesIdx++
      }

      /*
      inputBytes.forEach(byte => {
        if (bytesToSkip-- > 0) {
          return
        }

        const foundRepetition = false

        const repetitionSize = findRepetitions(state, inputBytes)
        bytesToSkip += repetitionSize

        if (!foundRepetition) {
          outputBits(state, state.nChBits[byte], state.nChCodes[byte])
        }
      })
      */

      state.inputBuffer.dropStart(inputBytes.length)
    }
  }

  if (debug && infLoopCntrForFindRepetitions > 0) {
    console.log(
      `There were a total of ${infLoopCntrForFindRepetitions} findRepetitions() calls which ended in infinite loops`
    )
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
    phase: 0,
    pairHashIndices: [],
    pairHashOffsets: [],
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
