/**
 * Configuration options for the implode & explode functions.
 */
export type Config = {
  /**
   * Whether the code should display extra messages on the console or not
   * @default false
   */
  verbose?: boolean
  /**
   * The starting size of the input buffer, may expand later as needed.
   * Not having to expand may have performance impact.
   * @default 0
   */
  inputBufferSize?: number
  /**
   * The starting size of the output buffer, may expand later as needed.
   * Not having to expand may have performance impact.
   * @default 0
   */
  outputBufferSize?: number
}

export type Stats = {
  chunkCounter: number
}

// ---------------------

/**
 * Handler for one chunk of bytes
 * @param chunk The chunk of bytes
 * @param encoding The encoding of the chunk (not used)
 * @param callback The callback to call when done
 */
export type Handler = (chunk: Buffer, encoding: string, callback: Callback) => void

/**
 * How the implode & explode functions store their internal state.
 */
export type PrivateState<T> = { _state: T }

export type QuasiTransformConstructorParameter = (
  obj: {
    handler: QuasiTransformConstructorParameter
    handle(chunk: Buffer, encoding: string): Promise<void>
  },
  chunk: Buffer,
  encoding: string,
) => void
