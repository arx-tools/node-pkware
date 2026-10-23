import { ChBitsAsc, ChCodeAsc } from '../constants.ts'
import { getLowestNBitsOf, mergeSparseArrays, repeat, unfold } from '../functions.ts'

/**
 * The ascii tables of the decoder, they are indexed by the codes that the compressed data contains.
 */
export type AsciiTables = {
  chBitsAsc: number[]
  asciiTable2C34: number[]
  asciiTable2D34: number[]
  asciiTable2E34: number[]
  asciiTable2EB4: number[]
}

/**
 * Generates the code table which maps the prefix codes to their length classes.
 *
 * @param startIndexes The first code of every length class.
 * @param lengthBits The number of the bits that every length class occupies.
 * @returns The code table, indexed by the prefix code.
 */
export function generateDecodeTables(startIndexes: number[], lengthBits: number[]): number[] {
  const codes = repeat(0, 0x1_00)

  for (const [i, lengthBit] of lengthBits.entries()) {
    for (let index = startIndexes[i]; index < 0x1_00; index = index + (1 << lengthBit)) {
      codes[index] = i
    }
  }

  return codes
}

/**
 * Creates the iterator of the populate ascii table algorithm.
 *
 * PAT = populate ascii table.
 *
 * @param limit The number of the generated indices.
 * @param stepper The number of the bits the seed moves with.
 * @returns A function which returns the next index and the seed, or false when it reached the limit.
 */
function createPATIterator(limit: number, stepper: number): (n: number) => [result: number, nextSeed: number] | false {
  return function (n: number): [result: number, nextSeed: number] | false {
    if (n >= limit) {
      return false
    }

    return [n, n + (1 << stepper)]
  }
}

/**
 * Fills the indices of one ascii table from the code of the character.
 *
 * @param value The number of the bits that the character occupies.
 * @param index The position of the character in the table.
 * @param bits The number of the bits that describe the character.
 * @param limit The size of the table.
 * @returns The sparse table, indexed by the code of the compressed data.
 */
function populateAsciiTable(value: number, index: number, bits: number, limit: number): number[] {
  const iterator = createPATIterator(limit, value - bits)
  const seed = ChCodeAsc[index] >> bits
  const indices = unfold(iterator, seed)

  const table: number[] = []
  for (const idx of indices) {
    table[idx] = index
  }

  return table
}

/**
 * Generates the ascii tables of the decoder.
 *
 * @returns The filled tables and the bit lengths of the characters.
 */
export function generateAsciiTables(): AsciiTables {
  const tables: AsciiTables = {
    chBitsAsc: repeat(0, 0x1_00),
    asciiTable2C34: repeat(0, 0x1_00),
    asciiTable2D34: repeat(0, 0x1_00),
    asciiTable2E34: repeat(0, 0x80),
    asciiTable2EB4: repeat(0, 0x1_00),
  }

  tables.chBitsAsc = ChBitsAsc.map((value, index) => {
    if (value <= 8) {
      tables.asciiTable2C34 = mergeSparseArrays(
        populateAsciiTable(value, index, 0, 0x1_00),
        tables.asciiTable2C34,
      ) as number[]

      return value
    }

    const acc = getLowestNBitsOf(ChCodeAsc[index], 8)
    if (acc === 0) {
      tables.asciiTable2EB4 = mergeSparseArrays(
        populateAsciiTable(value, index, 8, 0x1_00),
        tables.asciiTable2EB4,
      ) as number[]

      return value - 8
    }

    tables.asciiTable2C34[acc] = 0xff

    if (getLowestNBitsOf(acc, 6) === 0) {
      tables.asciiTable2E34 = mergeSparseArrays(
        populateAsciiTable(value, index, 6, 0x80),
        tables.asciiTable2E34,
      ) as number[]

      return value - 6
    }

    tables.asciiTable2D34 = mergeSparseArrays(
      populateAsciiTable(value, index, 4, 0x1_00),
      tables.asciiTable2D34,
    ) as number[]

    return value - 4
  })

  return tables
}
