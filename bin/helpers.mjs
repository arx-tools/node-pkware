import fs from 'fs'
import path from 'path'
import { test } from '../node_modules/ramda/src/index.mjs'

export const fileExists = (filename, flags = fs.constants.R_OK) => {
  try {
    fs.accessSync(filename, flags)
    return true
  } catch (err) {
    return false
  }
}

export const getPackageVersion = () => {
  const packageRootDir = path.dirname(path.dirname(import.meta.url.replace('file:///', '')))
  const { version } = JSON.parse(fs.readFileSync(path.resolve(packageRootDir, './package.json')))
  return version
}

export const isDecimalString = test(/^\d+$/)

export const isHexadecimalString = test(/^0x[0-9a-fA-F]+$/)
