const splitAt = index => {
  let cntr = 0

  return chunk => {
    let left
    let right

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = Buffer.from([])
      right = chunk
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = Buffer.from([])
    } else {
      // cntr ..... index ..... chunk.length
      left = chunk.slice(0, index - cntr)
      right = chunk.slice(index - cntr)
    }

    cntr += chunk.length
    return [left, right]
  }
}

module.exports = {
  splitAt
}
