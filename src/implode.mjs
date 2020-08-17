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
} from './common.mjs'
import { nBitsOfOnes, isBufferEmpty, appendByteToBuffer, getLowestByte, getLowestNBits } from './helpers.mjs'

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
          nChCode = (nChCode & 0xffff) + 2
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

    state.outputBuffer = Buffer.from([compressionType, state.dictionarySizeBits, 0])
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

  // in the original code bitBuffer is long, but cast to char
  state.outputBuffer[state.outputBuffer.length - 1] |= getLowestByte(bitBuffer << outBits)
  state.outBits = state.outBits + nBits

  if (state.outBits > 8) {
    bitBuffer = bitBuffer >> (8 - outBits)
    state.outputBuffer = appendByteToBuffer(getLowestByte(bitBuffer), state.outputBuffer)
    state.outBits = getLowestNBits(3, state.outBits)
  } else {
    state.outBits = getLowestNBits(3, state.outBits)
    if (state.outBits === 0) {
      state.outputBuffer = appendByteToBuffer(0, state.outputBuffer)
    }
  }
}

const processChunkData = state => {
  return new Promise((resolve, reject) => {
    if (state.inputBuffer.length > 0x1000 || state.streamEnded) {
      state.needMoreInput = false

      if (state.streamEnded && isBufferEmpty(state.inputBuffer)) {
        // need to wrap up writing bytes, just add final literal
      }

      console.log(
        `we have some data (${state.inputBuffer.length}/${0x1000} bytes) to process and ${
          state.streamEnded ? 'the stream ended' : 'we have more data to come'
        }`
      )

      const inputBytes = Array.from(state.inputBuffer.slice(0, 0x1000))
      inputBytes.forEach(char => {
        const foundRepetition = false

        if (!foundRepetition) {
          outputBits(state, state.nChBits[char], state.nChCodes[char])
        }
      })

      state.inputBuffer = state.inputBuffer.slice(inputBytes.length)
    }

    if (state.streamEnded) {
      outputBits(state, last(state.nChBits), last(state.nChCodes))
    } else {
      state.needMoreInput = true
    }

    resolve()
  })
}

const flushBuffer = state => {
  if (state.outputBuffer.length >= 0x800) {
    const output = state.outputBuffer.slice(0, 0x800)
    state.outputBuffer = state.outputBuffer.slice(0x800)

    if (state.outBits === 0) {
      state.outputBuffer[state.outputBuffer.length - 1] = 0
    }

    return output
  } else {
    return Buffer.from([])
  }
}

const implode = (compressionType, dictionarySize) => {
  let state = {
    isFirstChunk: true,
    needMoreInput: true, // TODO: not sure, if we need this flag
    streamEnded: false,
    phase: 0,
    compressionType: compressionType,
    dictionarySizeBytes: dictionarySize,
    distCodes: clone(DistCode),
    distBits: clone(DistBits),
    inputBuffer: Buffer.from([]),
    outputBuffer: Buffer.from([]),
    onInputFinished: callback => {
      state.streamEnded = true
      processChunkData(state)
        .then(() => {
          console.log(state.outputBuffer)
          callback(null, state.outputBuffer)
        })
        .catch(e => {
          callback(e)
        })
    }
  }

  return function (chunk, encoding, callback) {
    let work
    if (state.isFirstChunk) {
      state.isFirstChunk = false
      this._flush = state.onInputFinished
      state.inputBuffer = chunk
      work = setup(compressionType, dictionarySize).then(newState => {
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
        callback(null, flushBuffer(state))
      })
      .catch(e => {
        callback(e)
      })
  }
}

export default implode
