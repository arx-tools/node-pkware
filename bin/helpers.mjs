import fs from 'fs'
import path from 'path'

const fileExists = (filename, flags = fs.constants.R_OK) => {
  try {
    fs.accessSync(filename, flags)
    return true
  } catch (err) {
    return false
  }
}

const getPackageVersion = () => {
  const packageRootDir = path.dirname(path.dirname(import.meta.url.replace('file:///', '')))
  const { version } = JSON.parse(fs.readFileSync(path.resolve(packageRootDir, './package.json')))
  return version
}

export { fileExists, getPackageVersion }
