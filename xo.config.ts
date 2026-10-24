import { createXoConfig } from '@arx-tools/config'
import type { FlatXoConfig } from 'xo'

// the annotation keeps the type portability: without it the inferred type points into the
// `node_modules` of the package, which typescript does not accept
const xoConfig: FlatXoConfig = createXoConfig()

export default xoConfig
