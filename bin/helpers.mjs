import fs from 'fs'
import { Transform } from 'stream'

const fileExists = (filename, flags = fs.constants.R_OK) => {
  try {
    fs.accessSync(filename, flags)
    return true
  } catch (err) {
    return false
  }
}

const through = handler => {
  return new Transform({
    transform: handler
  })
}

const getPackageVersion = () => {
  const { version } = JSON.parse(fs.readFileSync('./package.json'))
  return version
}

export { fileExists, through, getPackageVersion }
