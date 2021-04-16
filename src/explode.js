const explode = () => {
  const fn = () => {}

  fn._state = {}

  return fn
}

module.exports = {
  explode
}
