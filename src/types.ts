/**
 * The compression type of a pkware stream.
 */
export type CompressionType = 'binary' | 'ascii'

/**
 * The dictionary size of a pkware stream, it determines how far back the compressor looks for
 * repetitions.
 */
export type DictionarySize = 'small' | 'medium' | 'large'
