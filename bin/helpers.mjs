import fs from 'fs'

const fileExists = (filename, flags = fs.constants.R_OK) => {
  try {
    fs.accessSync(filename, flags)
    return true
  } catch (err) {
    return false
  }
}

const getPackageVersion = () => {
  const { version } = JSON.parse(fs.readFileSync('./package.json'))
  return version
}

export { fileExists, getPackageVersion }
