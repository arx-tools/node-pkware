/**
 * Shared type signatures used throughout the library.
 */

/**
 * A traditional "nodeback<Buffer>" callback type.
 * @param error The error, if any.
 * @param data The data, if any.
 */
export type Callback = (error: Error | null, chunk: Buffer) => void

/**
 * Handler for one chunk of bytes
 * @param chunk The chunk of bytes
 * @param encoding The encoding of the chunk (not used)
 * @param callback The callback to call when done
 */
export type Handler = (chunk: Buffer, encoding: unknown, callback: Callback) => void

/**
 * How the implode & explode functions store their internal state.
 */
export type PrivateState<T> = { _state: T }

/**
 * Configuration options for the implode & explode functions.
 */
export type Config = {
  /**
   * Whether the code should display debug messages on the console or not
   * @default false
   */
  debug?: boolean
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
