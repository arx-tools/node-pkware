/**
 * Compression types for implode
 */
export enum Compression {
  Unknown = -1,
  Binary = 0,
  Ascii = 1,
}

/**
 * Dictionary sizes for implode, determines how well the file get compressed.
 *
 * Small dictionary size means less memory to lookback in data for repetitions,
 * meaning it will be less effective, the file stays larger, less compressed.
 * On the other hand, large compression allows more lookback allowing more effective
 * compression, thus generating smaller, more compressed files.
 */
export enum DictionarySize {
  Unknown = -1,
  Small = 4,
  Medium = 5,
  Large = 6,
}
