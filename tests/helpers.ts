import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileExists, pathToRepoRoot } from '../src/bin/helpers.ts'
import { through, type StreamHandler } from '../src/stream/stream.ts'
import { PkwareTestFilesNotFoundException } from './errors.ts'

/**
 * Expecting the {@link https://github.com/arx-tools/pkware-test-files|pkware-test-files}
 * repo to be on the same level as the node-pkware folder
 */
export const pkwareTestFilesFolder = path.resolve(pathToRepoRoot(), '../pkware-test-files/')

/**
 * Throws when the fixture repository is not next to this one
 *
 * @throws `PkwareTestFilesNotFoundException` when the folder is missing
 */
export async function assertTestFilesFolderExists(): Promise<void> {
  if (!(await fileExists(pkwareTestFilesFolder))) {
    throw new PkwareTestFilesNotFoundException()
  }
}

/**
 * Reads a file from the level1 fixture folder
 *
 * @param name the file name inside the level1 folder
 * @returns the content of the fixture
 */
export async function readFixture(name: string): Promise<Buffer> {
  return fs.readFile(path.resolve(pkwareTestFilesFolder, `./arx-fatalis/level1/${name}`))
}

/**
 * Runs the bytes through a stream handler in chunks of the given size
 *
 * @param handler the transform handler to run
 * @param input the bytes to transform
 * @param chunkSize the size of the chunks the input is split into
 * @returns the concatenated output of the stream
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
 * A handler which yields A, B, C, ... for every chunk it receives, so the position of the chunks can
 * be tracked in the output
 *
 * @returns a transform handler
 */
export function transformToABC(): StreamHandler {
  let counter = 0

  return (chunk: Buffer, encoding: NodeJS.BufferEncoding, callback): void => {
    counter = counter + 1
    callback(null, Buffer.from([65 + ((counter - 1) % 26)]))
  }
}
