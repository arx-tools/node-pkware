import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function isDecimalString(input: string): boolean {
  return /^\d+$/.test(input)
}

function isFullHexString(input: string): boolean {
  return /^\s*0x[\da-f]+\s*$/.test(input)
}

export function parseNumberString(n?: string, defaultValue: number = 0): number {
  if (n === undefined) {
    return defaultValue
  }

  if (isDecimalString(n)) {
    return Number.parseInt(n, 10)
  }

  if (isFullHexString(n)) {
    return Number.parseInt(n.replace(/^0x/, ''), 16)
  }

  return defaultValue
}

function pathToPackageJson(): string {
  const filename = fileURLToPath(import.meta.url)
  const dirname = path.dirname(filename)

  return path.resolve(dirname, '../../package.json')
}

export async function getPackageVersion(): Promise<string> {
  try {
    const rawIn = await fs.promises.readFile(pathToPackageJson(), 'utf8')
    const { version } = JSON.parse(rawIn) as { version: string }
    return version
  } catch {
    return 'unknown'
  }
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await fs.promises.access(filename, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function getInputStream(filename?: string): Promise<NodeJS.ReadableStream> {
  if (filename === undefined) {
    process.stdin.resume()
    return process.stdin
  }

  if (await fileExists(filename)) {
    return fs.createReadStream(filename)
  }

  throw new Error('input file does not exist')
}

export async function getOutputStream(filename?: string): Promise<NodeJS.WritableStream> {
  if (filename === undefined) {
    return process.stdout
  }

  return fs.createWriteStream(filename)
}
