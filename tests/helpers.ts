import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getHeaderSize } from 'arx-header-size'
import { durationFormatFromEnvironment, formatDuration } from '@arx-tools/config/formatDuration'
import { fileExists, pathToRepoRoot } from '../src/bin/helpers.ts'
import { through, type StreamHandler } from '../src/stream/stream.ts'
import { PkwareTestFilesNotFoundException } from './errors.ts'

/**
 * Expecting the {@link https://github.com/arx-tools/pkware-test-files|pkware-test-files}
 * repo to be on the same level as the node-pkware folder.
 */
export const pkwareTestFilesFolder = path.resolve(pathToRepoRoot(), '../pkware-test-files/')

/**
 * Throws when the fixture repository is not next to this one.
 *
 * @throws `PkwareTestFilesNotFoundException` when the folder is missing.
 */
export async function assertTestFilesFolderExists(): Promise<void> {
  if (!(await fileExists(pkwareTestFilesFolder))) {
    throw new PkwareTestFilesNotFoundException()
  }
}

/**
 * Reads a file from the arx-fatalis fixtures.
 *
 * @param levelAndName The level and the file name, for example `level1/level1.llf`.
 * @returns The content of the fixture.
 */
export async function readArxFixture(levelAndName: string): Promise<Buffer> {
  return await fs.readFile(path.resolve(pkwareTestFilesFolder, `./arx-fatalis/${levelAndName}`))
}

/**
 * Reads a file from the `implode-decoder` fixture folder, which contains streams produced by other
 * tools, including the ascii (text) compression that arx-fatalis does not use.
 *
 * @param name The file name inside the folder.
 * @returns The content of the fixture.
 */
export async function readDecoderFixture(name: string): Promise<Buffer> {
  return await fs.readFile(path.resolve(pkwareTestFilesFolder, `./implode-decoder/${name}`))
}

/**
 * Runs the bytes through a stream handler in chunks of the given size.
 *
 * @param handler The transform handler to run.
 * @param input The bytes to transform.
 * @param chunkSize The size of the chunks the input is split into.
 * @returns The concatenated output of the stream.
 */
export async function runStream(handler: StreamHandler, input: Buffer, chunkSize: number): Promise<Buffer> {
  const chunks: Buffer[] = []

  for (let offset = 0; offset < input.length; offset = offset + chunkSize) {
    chunks.push(input.subarray(offset, offset + chunkSize))
  }

  const output: Buffer[] = []
  const sink = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      output.push(chunk)
      callback()
    },
  })

  await pipeline(Readable.from(chunks), through(handler), sink)

  return Buffer.concat(output)
}

/**
 * A handler which yields the letters A, B, C and so on for every chunk it receives, so the position
 * of the chunks can be tracked in the output.
 *
 * @returns A transform handler.
 */
export function transformToABC(): StreamHandler {
  let counter = 0

  return (chunk: Buffer, encoding: NodeJS.BufferEncoding, callback): void => {
    counter = counter + 1
    callback(null, Buffer.from([65 + ((counter - 1) % 26)]))
  }
}

/**
 * Runs the block and prints how long it took.
 *
 * @param label The name of the measured block.
 * @param block The measured work.
 * @returns The value the block returns.
 */
export async function measure<T>(label: string, block: () => T | Promise<T>): Promise<T> {
  const startedAt = performance.now()
  const result = await block()
  const duration = formatDuration(performance.now() - startedAt, durationFormatFromEnvironment())

  if (duration.length === 0) {
    console.log(label)

    return result
  }

  console.log(`${label}: ${duration}`)

  return result
}

/**
 * Returns the size of the uncompressed header of a partially compressed fixture, the compressed data
 * starts after it.
 *
 * @param buffer The whole file.
 * @param format The format of the file.
 * @returns The number of the uncompressed bytes at the start of the file.
 */
export function getHeaderSizeOf(buffer: Buffer, format: 'dlf' | 'fts'): number {
  const exactBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

  return getHeaderSize(exactBuffer, format).total
}
