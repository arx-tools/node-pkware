import { Explode } from './Explode'
import { Config } from './types'

export const explode = (config: Config = {}) => {
  const instance = new Explode(config)
  return instance.getHandler()
}
export { explode as decompress }

// export { implode } from './_implode'
// export { implode as compress } from './_implode'

// export * as constants from './constants'
// export * as errors from './errors'
// export * as stream from './helpers/stream'
