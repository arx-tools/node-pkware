import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const isDecimalString = (input: string) => {
  return /^\d+$/.test(input)
}

const isFullHexString = (input: string) => {
  return /^\s*0x[0-9a-f]+\s*$/.test(input)
}

export const parseNumberString = (n?: string, defaultValue: number = 0) => {
  if (typeof n === 'undefined') {
    return defaultValue
  }

  if (isDecimalString(n)) {
    return parseInt(n)
  }

  if (isFullHexString(n)) {
    return parseInt(n.replace(/^0x/, ''), 16)
  }

  return defaultValue
}

export const getPackageVersion = async () => {
  try {
    const rawIn = await fs.promises.readFile(path.resolve(__dirname, '../../package.json'), 'utf-8')
    const { version } = JSON.parse(rawIn) as { version: string }
    return version
  } catch (error: unknown) {
    return 'unknown'
  }
}

const fileExists = async (filename: string) => {
  try {
    await fs.promises.access(filename, fs.constants.R_OK)
    return true
  } catch (error: unknown) {
    return false
  }
}

export const getInputStream = async (filename?: string): Promise<NodeJS.ReadableStream> => {
  if (filename === undefined) {
    process.stdin.resume()
    return process.stdin
  }

  if (await fileExists(filename)) {
    return fs.createReadStream(filename)
  }

  throw new Error('input file does not exist')
}

export const getOutputStream = async (filename?: string): Promise<NodeJS.WritableStream> => {
  if (filename === undefined) {
    return process.stdout
  }

  return fs.createWriteStream(filename)
}
