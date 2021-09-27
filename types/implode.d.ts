import { CompressionType, DictionarySizeBits } from './constants'
import ExpandingBuffer from './helpers/ExpandingBuffer'
import { Callback, Config, Handler, PrivateState } from './helpers/Shared'

type PrivateExplodeState = {
  _backup: {
    extraBits: number
    bitBuffer: Buffer
  }
  needMoreInput: boolean
  isFirstChunk: boolean
  extraBits: number
  bitBuffer: Buffer
  chBitsAsc: number[] // DecodeLit and GenAscTabs uses this
  lengthCodes: number[]
  distPosCodes: number[]
  nChBits: number[]
  nChCodes: number[]
  inputBuffer: ExpandingBuffer
  outputBuffer: ExpandingBuffer
  onInputFinished(callback: Callback): void
  backup(): void
  restore(): void
  stats: {
    chunkCounter: number
  }
  compressionType: CompressionType
  dictionarySizeBits: DictionarySizeBits
  dictionarySizeMask: number
  asciiTable2C34: number[]
  asciiTable2D34: number[]
  asciiTable2E34: number[]
  asciiTable2EB4: number[]
}

export function setup(state: PrivateExplodeState): void
export function outputBits(state: PrivateExplodeState, nBits: number, bitBuffer: number): void
export function getSizeOfMatching(inputBytes: number[], a: number, b: number): number
export function findRepetitions(
  inputBytes: number[],
  endOfLastMatch: number,
  cursor: number
): { size: number; distance: number }
export function isRepetitionFlushable(
  size: number,
  distance: number,
  startIndex: number,
  inputBufferSize: number
): boolean | null
export function processChunkData(state: PrivateExplodeState, debug?: boolean): void

/**
 * Compresses stream
 * @param compressionType one of `constants.CompressionType`
 * @param dictionarySizeBits one of `constants.DictionarySizeBits`
 * @param config `Config` object
 * @return a function, that you can use as a transform._transform method
 */
export function implode(
  compressionType: CompressionType,
  dictionarySizeBits: DictionarySizeBits,
  config?: Config
): PrivateState<PrivateExplodeState> & Handler
