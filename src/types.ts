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
   * Not having to expand may have positive performance impact.
   * @default 0
   */
  inputBufferSize?: number
  /**
   * The starting size of the output buffer, may expand later as needed.
   * Not having to expand may have positive performance impact.
   * @default 0
   */
  outputBufferSize?: number
}

export type Stats = {
  chunkCounter: number
}
