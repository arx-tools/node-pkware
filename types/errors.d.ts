/**
 * Thrown by
 * - `implode` when invalid dictionary size was specified
 * - `explode` when it encounters invalid data in the header section (the first 2 bytes of a compressed files)
 */
export class InvalidDictionarySizeError extends Error {}

/**
 * Thrown by
 * - `implode` when invalid compression type was specified
 * - `explode` when it encounters invalid data in the header section (the first 2 bytes of a compressed files)
 */
export class InvalidCompressionTypeError extends Error {}

/**
 * Thrown by
 * - `explode`, when compressed data is less, than `5` bytes long
 * 
 * Pkware compressed files have 2 bytes header followed by at lest 2 bytes of data and an end literal.
 */
export class InvalidDataError extends Error {}

/**
 * Thrown by
 * - `explode` when compressed data ends without reaching the end literal or in mid decompression
 */
export class AbortedError extends Error {}

export class ExpectedBufferError extends TypeError {}
export class ExpectedFunctionError extends TypeError {}
