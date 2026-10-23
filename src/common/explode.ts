import { COMPRESSION_CODES, DICTIONARY_CODES, DistBits, ExLenBits, LenBase, LenBits } from '../constants.ts'
import { AbortedError, InvalidCompressionTypeError, InvalidDictionarySizeError } from '../errors.ts'
import { getLowestNBitsOf, nBitsOfOnes } from '../functions.ts'
import type { CompressionType, DictionarySize } from '../types.ts'
import type { InputBuffer } from './inputBuffer.ts'

/**
 * The state that the shared decoder functions read and write. An explode instance of either api can
 * satisfy it, so the algorithms below run on the same state as the surrounding class.
 */
export type ExplodeContext = {
  bitBuffer: number
  extraBits: number
  inputBuffer: InputBuffer
  compressionType: CompressionType | 'unknown'
  dictionarySize: DictionarySize | 'unknown'
  dictionarySizeBits: number
  dictionarySizeMask: number
  lengthCodes: number[]
  distPosCodes: number[]
  chBitsAsc: number[]
  asciiTable2C34: number[]
  asciiTable2D34: number[]
  asciiTable2E34: number[]
  asciiTable2EB4: number[]
}

/**
 * Reads the compression type from a raw header byte.
 *
 * @param code The byte from the header.
 * @returns The compression type that the byte codes, either `binary` or `ascii`.
 * @throws `InvalidCompressionTypeError` when the byte is not a known code.
 */
function readCompressionType(code: number): CompressionType {
  switch (code) {
    case COMPRESSION_CODES.binary: {
      return 'binary'
    }

    case COMPRESSION_CODES.ascii: {
      return 'ascii'
    }

    default: {
      throw new InvalidCompressionTypeError()
    }
  }
}

/**
 * Reads the dictionary size from a raw header byte.
 *
 * @param code The byte from the header.
 * @returns The dictionary size that the byte codes, one of `small`, `medium` or `large`.
 * @throws `InvalidDictionarySizeError` when the byte is not a known code.
 */
function readDictionarySize(code: number): DictionarySize {
  switch (code) {
    case DICTIONARY_CODES.small: {
      return 'small'
    }

    case DICTIONARY_CODES.medium: {
      return 'medium'
    }

    case DICTIONARY_CODES.large: {
      return 'large'
    }

    default: {
      throw new InvalidDictionarySizeError()
    }
  }
}

/**
 * Reads the compression type and the dictionary size from the first two bytes of the input.
 *
 * @param inputBuffer The bytes of the compressed data.
 * @returns The parsed header.
 * @throws `InvalidCompressionTypeError` when the compression type byte is not a known code.
 * @throws `InvalidDictionarySizeError` when the dictionary size byte is not a known code.
 */
export function readHeader(inputBuffer: InputBuffer): {
  compressionType: CompressionType
  dictionarySize: DictionarySize
} {
  return {
    compressionType: readCompressionType(inputBuffer.readByte(0)),
    dictionarySize: readDictionarySize(inputBuffer.readByte(1)),
  }
}

/**
 * Parses the header and the first byte of the input.
 *
 * @param context The state of the decoder, the function reads and updates it.
 * @returns True when the header is parsed, false when there is not enough data yet.
 * @throws `InvalidCompressionTypeError` when the compression type byte is not a known code.
 * @throws `InvalidDictionarySizeError` when the dictionary size byte is not a known code.
 */
export function parseHeader(context: ExplodeContext): boolean {
  if (context.inputBuffer.size() < 4) {
    return false
  }

  const { compressionType, dictionarySize } = readHeader(context.inputBuffer)

  context.compressionType = compressionType
  context.dictionarySize = dictionarySize
  context.dictionarySizeBits = DICTIONARY_CODES[dictionarySize]
  context.dictionarySizeMask = nBitsOfOnes(context.dictionarySizeBits)
  context.bitBuffer = context.inputBuffer.readByte(2)
  context.inputBuffer.dropStart(3)

  return true
}

/**
 * Skips the given number of bits of the input.
 *
 * @param context The state of the decoder, the function reads and updates it.
 * @param numberOfBits The number of the bits to skip.
 * @throws `AbortedError` when there isn't enough data to be wasted.
 */
export function wasteBits(context: ExplodeContext, numberOfBits: number): void {
  if (numberOfBits > context.extraBits && context.inputBuffer.isEmpty()) {
    throw new AbortedError()
  }

  if (numberOfBits <= context.extraBits) {
    context.bitBuffer = context.bitBuffer >> numberOfBits
    context.extraBits = context.extraBits - numberOfBits
    return
  }

  const nextByte = context.inputBuffer.readByte(0)
  context.inputBuffer.dropStart(1)

  context.bitBuffer = ((context.bitBuffer >> context.extraBits) | (nextByte << 8)) >> (numberOfBits - context.extraBits)
  context.extraBits = context.extraBits + 8 - numberOfBits
}

/**
 * Decodes the next literal from the input.
 *
 * @param context The state of the decoder, the function reads and updates it.
 * @returns The decoded byte.
 * @throws `AbortedError` when the input ends in the middle of the literal.
 */
export function decodeNextLiteral(context: ExplodeContext): number {
  const lastBit = getLowestNBitsOf(context.bitBuffer, 1)

  wasteBits(context, 1)

  if (lastBit !== 0) {
    let lengthCode = context.lengthCodes[getLowestNBitsOf(context.bitBuffer, 8)]

    wasteBits(context, LenBits[lengthCode])

    const extraLenghtBits = ExLenBits[lengthCode]
    if (extraLenghtBits !== 0) {
      const extraLength = getLowestNBitsOf(context.bitBuffer, extraLenghtBits)

      try {
        wasteBits(context, extraLenghtBits)
      } catch {
        if (lengthCode + extraLength !== 0x1_0e) {
          throw new AbortedError()
        }
      }

      lengthCode = LenBase[lengthCode] + extraLength
    }

    return lengthCode + 0x1_00
  }

  const lastByte = getLowestNBitsOf(context.bitBuffer, 8)

  if (context.compressionType === 'binary') {
    wasteBits(context, 8)
    return lastByte
  }

  let value: number

  if (lastByte > 0) {
    value = context.asciiTable2C34[lastByte]

    if (value === 0xff) {
      if (getLowestNBitsOf(context.bitBuffer, 6) === 0) {
        wasteBits(context, 6)
        value = context.asciiTable2E34[getLowestNBitsOf(context.bitBuffer, 7)]
      } else {
        wasteBits(context, 4)
        value = context.asciiTable2D34[getLowestNBitsOf(context.bitBuffer, 8)]
      }
    }
  } else {
    wasteBits(context, 8)
    value = context.asciiTable2EB4[getLowestNBitsOf(context.bitBuffer, 8)]
  }

  wasteBits(context, context.chBitsAsc[value])

  return value
}

/**
 * Decodes the distance of a repetition.
 *
 * @param context The state of the decoder, the function reads and updates it.
 * @param repeatLength The length of the repetition, the distance of a 2 byte long one is coded
 * differently.
 * @returns The distance of the repetition, counted in bytes.
 * @throws `AbortedError` when the input ends in the middle of the distance.
 */
export function decodeDistance(context: ExplodeContext, repeatLength: number): number {
  const distPosCode = context.distPosCodes[getLowestNBitsOf(context.bitBuffer, 8)]
  const distPosBits = DistBits[distPosCode]

  wasteBits(context, distPosBits)

  let distance: number
  let bitsToWaste: number

  if (repeatLength === 2) {
    distance = (distPosCode << 2) | getLowestNBitsOf(context.bitBuffer, 2)
    bitsToWaste = 2
  } else {
    distance = (distPosCode << context.dictionarySizeBits) | (context.bitBuffer & context.dictionarySizeMask)
    bitsToWaste = context.dictionarySizeBits
  }

  wasteBits(context, bitsToWaste)

  return distance + 1
}
