import fs from 'fs'
import path from 'path'
import * as R from 'ramda'

const { test } = R

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

export const parseNumberString = (n, defaultValue = 0) => {
  if (isDecimalString(n)) {
    return parseInt(n)
  } else if (isHexadecimalString(n)) {
    return parseInt(n.replace(/^0x/, ''), 16)
  } else {
    return defaultValue
  }
}
