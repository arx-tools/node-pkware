const isPromise = promise => {
  return typeof promise === 'object' && promise.constructor.name === 'Promise'
}

export { isPromise }
