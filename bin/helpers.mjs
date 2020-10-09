import fs from 'fs'
import path from 'path'
import { test } from '../node_modules/ramda/src/index.mjs'

export const fileExists = async filename => {
  try {
    await fs.promises.access(filename, fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
}

export const getPackageVersion = async () => {
  const packageRootDir = path.dirname(path.dirname(import.meta.url.replace('file:///', '')))
  try {
    const { version } = JSON.parse(await fs.promises.readFile(path.resolve(packageRootDir, './package.json')))
    return version
  } catch (error) {
    return 'unknown'
  }
}

export const isDecimalString = test(/^\d+$/)

export const isHexadecimalString = test(/^0x[0-9a-fA-F]+$/)
