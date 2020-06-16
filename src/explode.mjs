/* eslint-disable camelcase, no-unused-vars */

import { length, repeat, clone } from '../node_modules/ramda/src/index.mjs'
import {
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_NO_ERROR,
  CMP_INVALID_DICTSIZE,
  CMP_INVALID_MODE,
  CMP_BAD_DATA,
  CMP_ABORT,
  PKDCL_OK,
  PKDCL_STREAM_END,
  DistCode,
  DistBits,
  LenBits,
  LenCode,
  ExLenBits,
  LenBase,
  ChBitsAsc,
  ChCodeAsc,
  getValueFromPointer,
  copyPointer,
  getAddressOfValue,
  makePointerFrom,
  setValueToPointer
} from './common.mjs'

const GenDecodeTabs = (originalPositions, start_indexes, length_bits) => {
  const positions = clone(originalPositions)
  const elements = length(length_bits)

  for (let i = 0; i < elements; i++) {
    const size = 1 << length_bits[i]

    for (let index = start_indexes[i]; index < 0x100; index += size) {
      positions[index] = i
    }
  }

  return positions
}

const GenAscTabs = pWork => {
  const pChCodeAsc = copyPointer(ChCodeAsc[0xff]) // pointer

  for (let count = 0x00ff; count >= 0; count--) {
    const pChBitsAsc = makePointerFrom(pWork.ChBitsAsc, count) // pointer
    let bits_asc = getValueFromPointer(pChBitsAsc)

    let acc
    let add

    if (bits_asc <= 8) {
      add = 1 << bits_asc
      acc = getValueFromPointer(pChCodeAsc)

      do {
        pWork.offs2C34[acc] = count
        acc += add
      } while (acc < 0x100)
    } else if ((acc = getValueFromPointer(pChCodeAsc) & 0xff) !== 0) {
      pWork.offs2C34[acc] = 0xff

      if (getValueFromPointer(pChCodeAsc) & 0x3f) {
        bits_asc -= 4
        setValueToPointer(pChBitsAsc, bits_asc)
        add = 1 << bits_asc

        acc = getValueFromPointer(pChCodeAsc) >> 4
        do {
          pWork.offs2D34[acc] = count
          acc += add
        } while (acc < 0x100)
      } else {
        bits_asc -= 6
        setValueToPointer(pChBitsAsc, bits_asc)
        add = 1 << bits_asc

        acc = getValueFromPointer(pChCodeAsc) >> 6
        do {
          pWork.offs2E34[acc] = count
          acc += add
        } while (acc < 0x80)
      }
    } else {
      bits_asc -= 8
      setValueToPointer(pChBitsAsc, bits_asc)
      add = 1 << bits_asc

      acc = getValueFromPointer(pChCodeAsc) >> 8

      do {
        pWork.offs2EB4[acc] = count
        acc += add
      } while (acc < 0x100)
    }
  }
}

const WasteBits = (pWork, nBits) => {
  if (nBits <= pWork.extra_bits) {
    pWork.extra_bits -= nBits
    pWork.bit_buff >>= nBits
    return PKDCL_OK
  }

  pWork.bit_buff >>= pWork.extra_bits
  if (pWork.in_pos === pWork.in_bytes) {
    pWork.in_pos = length(pWork.in_buff)
    if ((pWork.in_bytes = pWork.read_buf(getValueFromPointer(pWork.in_buff), copyPointer(pWork.in_pos))) === 0) {
      return PKDCL_STREAM_END
    }
    pWork.in_pos = 0
  }

  pWork.bit_buff |= pWork.in_buff[pWork.in_pos++] << 8
  pWork.bit_buff >>= nBits - pWork.extra_bits
  pWork.extra_bits = pWork.extra_bits - nBits + 8
  return PKDCL_OK
}

const DecodeLit = pWork => {
  let extra_length_bits
  let length_code
  let value

  if (pWork.bit_buff & 1) {
    if (WasteBits(pWork, 1)) {
      return 0x306
    }

    length_code = pWork.LengthCodes[pWork.bit_buff & 0xff]

    if (WasteBits(pWork, pWork.LenBits[length_code])) {
      return 0x306
    }

    if ((extra_length_bits = pWork.ExLenBits[length_code]) !== 0) {
      const extra_length = pWork.bit_buff & ((1 << extra_length_bits) - 1)

      if (WasteBits(pWork, extra_length_bits)) {
        if (length_code + extra_length !== 0x10e) {
          return 0x306
        }
      }
      length_code = pWork.LenBase[length_code] + extra_length
    }
    return length_code + 0x100
  }

  if (WasteBits(pWork, 1)) {
    return 0x306
  }

  if (pWork.ctype === BINARY_COMPRESSION) {
    const uncompressed_byte = pWork.bit_buff & 0xff

    if (WasteBits(pWork, 8)) {
      return 0x306
    }
    return uncompressed_byte
  }

  if (pWork.bit_buff & 0xff) {
    value = pWork.offs2C34[pWork.bit_buff & 0xff]

    if (value === 0xff) {
      if (pWork.bit_buff & 0x3f) {
        if (WasteBits(pWork, 4)) {
          return 0x306
        }

        value = pWork.offs2D34[pWork.bit_buff & 0xff]
      } else {
        if (WasteBits(pWork, 6)) {
          return 0x306
        }

        value = pWork.offs2E34[pWork.bit_buff & 0x7f]
      }
    }
  } else {
    if (WasteBits(pWork, 8)) {
      return 0x306
    }

    value = pWork.offs2EB4[pWork.bit_buff & 0xff]
  }

  return WasteBits(pWork, pWork.ChBitsAsc[value]) ? 0x306 : value
}

const DecodeDist = (pWork, rep_length) => {
  let distance

  const dist_pos_code = pWork.DistPosCodes[pWork.bit_buff & 0xff]
  const dist_pos_bits = pWork.DistBits[dist_pos_code]

  if (WasteBits(pWork, dist_pos_bits)) {
    return 0
  }

  if (rep_length === 2) {
    distance = (dist_pos_code << 2) | (pWork.bit_buff & 0x03)
    if (WasteBits(pWork, 2)) {
      return 0
    }
  } else {
    distance = (dist_pos_code << pWork.dsize_bits) | (pWork.bit_buff & pWork.dsize_mask)
    if (WasteBits(pWork, pWork.dsize_bits)) {
      return 0
    }
  }

  return distance + 1
}

const Expand = pWork => {
  let result
  let next_literal
  let copyBytes

  pWork.outputPos = 0x1000

  /*
    while((result = next_literal = DecodeLit(pWork)) < 0x305)
    {
        // If the literal is greater than 0x100, it holds length
        // of repeating byte sequence
        // literal of 0x100 means repeating sequence of 0x2 bytes
        // literal of 0x101 means repeating sequence of 0x3 bytes
        // ...
        // literal of 0x305 means repeating sequence of 0x207 bytes
        if(next_literal >= 0x100)
        {
            unsigned char * source;
            unsigned char * target;
            unsigned int rep_length;       // Length of the repetition, in bytes
            unsigned int minus_dist;       // Backward distance to the repetition, relative to the current buffer position

            // Get the length of the repeating sequence.
            // Note that the repeating block may overlap the current output position,
            // for example if there was a sequence of equal bytes
            rep_length = next_literal - 0xFE;

            // Get backward distance to the repetition
            if((minus_dist = DecodeDist(pWork, rep_length)) == 0)
            {
                result = 0x306;
                break;
            }

            // Target and source pointer
            target = &pWork->out_buff[pWork->outputPos];
            source = target - minus_dist;

            // Update buffer output position
            pWork->outputPos += rep_length;

            // Copy the repeating sequence
            while(rep_length-- > 0)
                *target++ = *source++;
        }
        else
        {
            pWork->out_buff[pWork->outputPos++] = (unsigned char)next_literal;
        }

        // Flush the output buffer, if number of extracted bytes has reached the end
        if(pWork->outputPos >= 0x2000)
        {
            // Copy decompressed data into user buffer
            copyBytes = 0x1000;
            pWork->write_buf((char *)&pWork->out_buff[0x1000], &copyBytes, pWork->param);

            // Now copy the decompressed data to the first half of the buffer.
            // This is needed because the decompression might reuse them as repetitions.
            // Note that if the output buffer overflowed previously, the extra decompressed bytes
            // are stored in "out_buff_overflow", and they will now be
            // within decompressed part of the output buffer.
            memmove(pWork->out_buff, &pWork->out_buff[0x1000], pWork->outputPos - 0x1000);
            pWork->outputPos -= 0x1000;
        }
    }

    // Flush any remaining decompressed bytes
    copyBytes = pWork->outputPos - 0x1000;
    pWork->write_buf((char *)&pWork->out_buff[0x1000], &copyBytes, pWork->param);
    */
  return result
}

const explode = (read_buf, write_buf) => {
  const pWork = {
    ctype: 0,
    outputPos: 0,
    dsize_bits: 0,
    dsize_mask: 0,
    bit_buff: 0,
    extra_bits: 0,
    in_pos: 0x800,
    in_bytes: 0,
    read_buf: copyPointer(read_buf),
    write_buf: copyPointer(write_buf),
    out_buff: repeat(0, 0x2204),
    in_buff: repeat(0, 0x800),
    DistPosCodes: repeat(0, 0x100),
    LengthCodes: repeat(0, 0x100),
    offs2C34: repeat(0, 0x100),
    offs2D34: repeat(0, 0x100),
    offs2E34: repeat(0, 0x80),
    offs2EB4: repeat(0, 0x100),
    ChBitsAsc: repeat(0, 0x100),
    DistBits: repeat(0, 0x40),
    LenBits: repeat(0, 0x10),
    ExLenBits: repeat(0, 0x10),
    LenBase: repeat(0, 0x10)
  }

  // read_buf reads data to in_buff and returns the amount of bytes, that have been read
  // read_buf will override 2nd parameter (amount of bytes to read) if there is less to be read
  pWork.in_bytes = pWork.read_buf(pWork.in_buff, getAddressOfValue(pWork.in_pos))

  if (pWork.in_bytes <= 4) {
    // file is less, than 4 bytes long, which is invalid
    return CMP_BAD_DATA
  }

  pWork.ctype = pWork.in_buff[0] // Get the compression type (BINARY or ASCII)
  pWork.dsize_bits = pWork.in_buff[1] // Get the dictionary size
  pWork.bit_buff = pWork.in_buff[2] // Initialize 16-bit bit buffer
  pWork.in_pos = 3 // Position in input buffer

  if (pWork.dsize_bits < 4 || pWork.dsize_bits > 6) {
    return CMP_INVALID_DICTSIZE
  }

  pWork.dsize_mask = 0xffff >> (0x10 - pWork.dsize_bits)

  if (pWork.ctype !== BINARY_COMPRESSION) {
    if (pWork.ctype !== ASCII_COMPRESSION) {
      return CMP_INVALID_MODE
    }

    pWork.ChBitsAsc = clone(ChBitsAsc)
    GenAscTabs(pWork)
  }

  pWork.LenBits = clone(LenBits)
  pWork.LengthCodes = GenDecodeTabs(pWork.LengthCodes, LenCode, pWork.LenBits)
  pWork.ExLenBits = clone(ExLenBits)
  pWork.LenBase = clone(LenBase)
  pWork.DistBits = clone(DistBits)
  pWork.DistPosCodes = GenDecodeTabs(pWork.DistPosCodes, DistCode, pWork.DistBits)

  if (Expand(pWork) !== 0x306) {
    return CMP_NO_ERROR
  }

  return CMP_ABORT
}

/* eslint-enable */

export default explode
