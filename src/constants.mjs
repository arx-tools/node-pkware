import { times } from 'ramda'

export const CMP_BINARY = 0 // Binary compression
export const CMP_ASCII = 1 // Ascii compression

export const CMP_NO_ERROR = 0
export const CMP_INVALID_DICTSIZE = 1
export const CMP_INVALID_MODE = 2
export const CMP_BAD_DATA = 3
export const CMP_ABORT = 4

export const CMP_IMPLODE_DICT_SIZE1 = 1024 // Dictionary size of 1024
export const CMP_IMPLODE_DICT_SIZE2 = 2048 // Dictionary size of 2048
export const CMP_IMPLODE_DICT_SIZE3 = 4096 // Dictionary size of 4096

export const cType = {
  signed: {
    char: 'getInt8',
    short: 'getInt16',
    int: 'getInt32',
    long: 'getInt32'
  },
  unsigned: {
    char: 'getUint8',
    short: 'getUint16',
    int: 'getUint32',
    long: 'getUint32'
  }
}
