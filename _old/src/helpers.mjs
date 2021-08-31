export const dumpBytes = bytes => {
  const formattedBytes = Array.from(bytes)
    .map(byte => toHex(byte, 2, true))
    .join(' ')
  return `<${formattedBytes}>`
}

export const splitAtMatch = (matches, skipBytes = 0, debug = false) => {
  let alreadyMatched = false
  const empty = Buffer.from([])

  return (chunk, offset) => {
    if (alreadyMatched) {
      return {
        left: empty,
        right: chunk
      }
    }

    const idxs = matches
      .map(bytes => chunk.indexOf(bytes))
      .filter(idx => idx > -1)
      .sort(subtract)
      .filter(idx => idx + offset >= skipBytes)

    if (idxs.length === 0) {
      return {
        left: empty,
        right: chunk
      }
    }

    alreadyMatched = true
    if (debug) {
      console.log(`found pkware header ${dumpBytes(chunk.slice(idxs[0], idxs[0] + 2))} at ${toHex(idxs[0])}`)
    }
    return splitAtIndex(idxs[0])(chunk, offset)
  }
}

export const isNumeric = val => {
  return parseInt(val.trim()).toString() === val.trim()
}
