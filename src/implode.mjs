const implode = () => {
  return (chunk, encoding, callback) => {
    callback(null, chunk)
  }
}

export default implode
