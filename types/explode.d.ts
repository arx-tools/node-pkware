import { ExpandingBuffer } from './helpers/ExpandingBuffer'
import { Callback, Config, Handler, PrivateState } from './helpers/Shared'
import { CompressionType, DictionarySizeBits, PKDCL_STREAM_END, PKDCL_OK, LITERAL_STREAM_ABORTED } from './constants'

export function readHeader(buffer: Buffer): {
  compressionType: CompressionType
  dictionarySizeBits: DictionarySizeBits
}

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

/**
 * Decompresses stream
 * @returns a function, that you can use as a `transform._transform` method.
 */
export function explode(config?: Config): PrivateState<PrivateExplodeState> & Handler
export function createPATIterator(limit: number, stepper: number): (n: number) => false | [number, number]
export function populateAsciiTable(value: number, index: number, bits: number, limit: number): number[]
export function generateAsciiTables(): {
  asciiTable2C34: number[]
  asciiTable2D34: number[]
  asciiTable2E34: number[]
  asciiTable2EB4: number[]
}
export function processChunkData(state: PrivateExplodeState, verbose?: boolean): void
export function wasteBits(state: PrivateExplodeState, numberOfBits: number): typeof PKDCL_STREAM_END | typeof PKDCL_OK
export function decodeNextLiteral(state: PrivateExplodeState): typeof LITERAL_STREAM_ABORTED | number
export function decodeDistance(state: PrivateExplodeState, repeatLength: number): number
export function generateDecodeTables(startIndexes: number[], lengthBits: number[]): number[]
