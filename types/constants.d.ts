export const COMPRESSION_BINARY: 0
export const COMPRESSION_ASCII: 1
export const DICTIONARY_SIZE_SMALL: 4
export const DICTIONARY_SIZE_MEDIUM: 5
export const DICTIONARY_SIZE_LARGE: 6
export const LONGEST_ALLOWED_REPETITION: 0x204

export const PKDCL_OK: 'OK'
export const PKDCL_STREAM_END: 'All data from the input stream is read'
export const PKDCL_NEED_DICT: 'Need more data (dictionary)'
export const PKDCL_CONTINUE: 'Continue (internal flag)'
export const PKDCL_GET_INPUT: 'Get input (internal flag)'

export const LITERAL_END_STREAM: 0x305
export const LITERAL_STREAM_ABORTED: 0x306

export const DistCode: number[]
export const DistBits: number[]
export const LenBits: number[]
export const LenCode: number[]
export const ExLenBits: number[]
export const LenBase: number[]
export const ChBitsAsc: number[]
export const ChCodeAsc: number[]

// Additional types

/**
 * Compression types for implode
 */
export type CompressionType = typeof COMPRESSION_BINARY | typeof COMPRESSION_ASCII
/**
 * Dictionary sizes for implode, determines how well the file get compressed.
 *
 * Small dictionary size means less memory to lookback in data for repetitions, meaning it will be less effective, the file stays larger, less compressed.
 * On the other hand, large compression allows more lookback allowing more effective compression, thus generating smaller, more compressed files.
 */
export type DictionarySizeBits =
  | typeof DICTIONARY_SIZE_SMALL
  | typeof DICTIONARY_SIZE_MEDIUM
  | typeof DICTIONARY_SIZE_LARGE
