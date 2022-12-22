import { Explode } from './Explode'
import { Implode } from './Implode'
import { Config } from './types'

export const explode = (config: Config = {}) => {
  const instance = new Explode(config)
  return instance.getHandler()
}

export const implode = (config: Config = {}) => {
  const instance = new Implode(config)
  return instance.getHandler()
}

export { explode as decompress }
export { implode as compress }

// export * as constants from './constants'
// export * as errors from './errors'
// export * as stream from './helpers/stream'
