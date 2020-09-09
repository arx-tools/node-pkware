// mutable functions

import { toHex } from './helpers.mjs'

const flushBuffer = (chunkSize, state) => {
  if (state.outputBuffer.length >= chunkSize) {
    const outputSize = state.outputBuffer.length - (state.outputBuffer.length % chunkSize)
    const output = state.outputBuffer.slice(0, outputSize)
    state.outputBuffer = state.outputBuffer.slice(outputSize)

    console.log(`writing ${toHex(output.length)} bytes`)

    return output
  } else {
    return Buffer.from([])
  }
}

export { flushBuffer }
