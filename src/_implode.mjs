/* eslint-disable camelcase, no-unused-vars, no-labels */

import { clone, repeat, length } from '../node_modules/ramda/src/index.mjs'
import {
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_NO_ERROR,
  CMP_INVALID_DICTSIZE,
  CMP_INVALID_MODE,
  CMP_IMPLODE_DICT_SIZE1,
  CMP_IMPLODE_DICT_SIZE2,
  CMP_IMPLODE_DICT_SIZE3,
  MAX_REP_LENGTH,
  DistCode,
  DistBits,
  LenBits,
  LenCode,
  ExLenBits,
  ChBitsAsc,
  ChCodeAsc
} from './common.mjs'

import { getValueFromPointer, copyPointer, makePointerFrom, getAddressOfValue } from './_helpers.mjs'

const BYTE_PAIR_HASH = buffer => buffer[0] * 4 + buffer[1] * 5

const SortBuffer = (pWork, buffer_begin, buffer_end) => {
  /*
  unsigned short * phash_to_index;
  unsigned char  * buffer_ptr;
  */
  const total_sum = 0
  let byte_pair_hash // Hash value of the byte pair
  let byte_pair_offs // Offset of the byte pair, relative to "work_buff"

  pWork.phash_to_index = repeat(0, 0x900)

  /*
    // Step 1: Count amount of each PAIR_HASH in the input buffer
    // The table will look like this:
    //  offs 0x000: Number of occurences of PAIR_HASH 0
    //  offs 0x001: Number of occurences of PAIR_HASH 1
    //  ...
    //  offs 0x8F7: Number of occurences of PAIR_HASH 0x8F7 (the highest hash value)
    for(buffer_ptr = buffer_begin; buffer_ptr < buffer_end; buffer_ptr++)
        pWork.phash_to_index[BYTE_PAIR_HASH(buffer_ptr)]++;

    // Step 2: Convert the table to the array of PAIR_HASH amounts.
    // Each element contains count of PAIR_HASHes that is less or equal
    // to element index
    // The table will look like this:
    //  offs 0x000: Number of occurences of PAIR_HASH 0 or lower
    //  offs 0x001: Number of occurences of PAIR_HASH 1 or lower
    //  ...
    //  offs 0x8F7: Number of occurences of PAIR_HASH 0x8F7 or lower
    for(phash_to_index = pWork.phash_to_index; phash_to_index < &pWork.phash_to_index_end; phash_to_index++)
    {
        total_sum = total_sum + phash_to_index[0];
        phash_to_index[0] = total_sum;
    }

    // Step 3: Convert the table to the array of indexes.
    // Now, each element contains index to the first occurence of given PAIR_HASH
    for(buffer_end--; buffer_end >= buffer_begin; buffer_end--)
    {
        byte_pair_hash = BYTE_PAIR_HASH(buffer_end);
        byte_pair_offs = (unsigned short)(buffer_end - pWork.work_buff);

        pWork.phash_to_index[byte_pair_hash]--;
        pWork.phash_offs[pWork.phash_to_index[byte_pair_hash]] = byte_pair_offs;
    }
    */
}

const FlushBuf = pWork => {
  const size = 0x800

  pWork.write_buf(pWork.out_buff, getAddressOfValue(size))

  const save_ch1 = pWork.out_buff[0x800]
  const save_ch2 = pWork.out_buff[pWork.out_bytes]
  pWork.out_bytes -= 0x800

  pWork.out_buff = repeat(0, length(pWork.out_buff))

  if (pWork.out_bytes !== 0) {
    pWork.out_buff[0] = save_ch1
  }
  if (pWork.out_bits !== 0) {
    pWork.out_buff[pWork.out_bytes] = save_ch2
  }
}

const OutputBits = (pWork, nbits, bit_buff) => {
  if (nbits > 8) {
    OutputBits(pWork, 8, bit_buff)
    bit_buff >>= 8
    nbits -= 8
  }

  const out_bits = pWork.out_bits
  pWork.out_buff[pWork.out_bytes] |= bit_buff << out_bits

  pWork.out_bits += nbits

  // If 8 or more bits, increment number of bytes
  if (pWork.out_bits > 8) {
    pWork.out_bytes++
    bit_buff >>= 8 - out_bits

    pWork.out_buff[pWork.out_bytes] = bit_buff
    pWork.out_bits &= 7
  } else {
    pWork.out_bits &= 7
    if (pWork.out_bits === 0) {
      pWork.out_bytes++
    }
  }

  if (pWork.out_bytes >= 0x800) {
    FlushBuf(pWork)
  }
}

const FindRep = (pWork, input_data) => {
  const phash_to_index = makePointerFrom(pWork.phash_to_index, BYTE_PAIR_HASH(input_data))
  /*
  unsigned short * phash_offs;                // Pointer to the table containing offsets of each PAIR_HASH
  unsigned char * repetition_limit;           // An eventual repetition must be at position below this pointer
  unsigned char * prev_repetition;            // Pointer to the previous occurence of the current PAIR_HASH
  unsigned char * prev_rep_end;               // End of the previous repetition
  unsigned char * input_data_ptr;
  */
  const phash_offs_index = phash_to_index[0]
  const min_phash_offs = makePointerFrom(input_data, -pWork.work_buff + pWork.dsize_bytes - 1)
  let offs_in_rep // Offset within found repetition
  let equal_byte_count // Number of bytes that are equal to the previous occurence
  const rep_length = 1 // Length of the found repetition
  let rep_length2 // Secondary repetition
  let pre_last_byte // Last but one byte from a repetion
  let di_val

  /*
    // If the PAIR_HASH offset is below the limit, find a next one
    phash_offs = pWork.phash_offs + phash_offs_index;
    if(getValueFromPointer(phash_offs) < min_phash_offs)
    {
        while(getValueFromPointer(phash_offs) < min_phash_offs)
        {
            phash_offs_index++;
            phash_offs++;
        }
        *phash_to_index = phash_offs_index;
    }

    // Get the first location of the PAIR_HASH,
    // and thus the first eventual location of byte repetition
    phash_offs = pWork.phash_offs + phash_offs_index;
    prev_repetition = pWork.work_buff + phash_offs[0];
    repetition_limit = input_data - 1;

    // If the current PAIR_HASH was not encountered before,
    // we haven't found a repetition.
    if(prev_repetition >= repetition_limit)
        return 0;

    // We have found a match of a PAIR_HASH. Now we have to make sure
    // that it is also a byte match, because PAIR_HASH is not unique.
    // We compare the bytes and count the length of the repetition
    input_data_ptr = input_data;
    for(;;)
    {
        // If the first byte of the repetition and the so-far-last byte
        // of the repetition are equal, we will compare the blocks.
        if(*input_data_ptr == *prev_repetition && input_data_ptr[rep_length-1] == prev_repetition[rep_length-1])
        {
            // Skip the current byte
            prev_repetition++;
            input_data_ptr++;
            equal_byte_count = 2;

            // Now count how many more bytes are equal
            while(equal_byte_count < MAX_REP_LENGTH)
            {
                prev_repetition++;
                input_data_ptr++;

                // Are the bytes different ?
                if(*prev_repetition != *input_data_ptr)
                    break;

                equal_byte_count++;
            }

            // If we found a repetition of at least the same length, take it.
            // If there are multiple repetitions in the input buffer, this will
            // make sure that we find the most recent one, which in turn allows
            // us to store backward length in less amount of bits
            input_data_ptr = input_data;
            if(equal_byte_count >= rep_length)
            {
                // Calculate the backward distance of the repetition.
                // Note that the distance is stored as decremented by 1
                pWork.distance = (unsigned int)(input_data - prev_repetition + equal_byte_count - 1);

                // Repetitions longer than 10 bytes will be stored in more bits,
                // so they need a bit different handling
                if((rep_length = equal_byte_count) > 10)
                    break;
            }
        }

        // Move forward in the table of PAIR_HASH repetitions.
        // There might be a more recent occurence of the same repetition.
        phash_offs_index++;
        phash_offs++;
        prev_repetition = pWork.work_buff + phash_offs[0];

        // If the next repetition is beyond the minimum allowed repetition, we are done.
        if(prev_repetition >= repetition_limit)
        {
            // A repetition must have at least 2 bytes, otherwise it's not worth it
            return (rep_length >= 2) ? rep_length : 0;
        }
    }
    */

  // If the repetition has max length of 0x204 bytes, we can't go any fuhrter
  if (equal_byte_count === MAX_REP_LENGTH) {
    pWork.distance--
    return equal_byte_count
  }

  /*
    // Check for possibility of a repetition that occurs at more recent position
    phash_offs = pWork.phash_offs + phash_offs_index;
    if(pWork.work_buff + phash_offs[1] >= repetition_limit)
        return rep_length;

    //
    // The following part checks if there isn't a longer repetition at
    // a latter offset, that would lead to better compression.
    //
    // Example of data that can trigger this optimization:
    //
    //   "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEQQQQQQQQQQQQ"
    //   "XYZ"
    //   "EEEEEEEEEEEEEEEEQQQQQQQQQQQQ";
    //
    // Description of data in this buffer
    //   [0x00] Single byte "E"
    //   [0x01] Single byte "E"
    //   [0x02] Repeat 0x1E bytes from [0x00]
    //   [0x20] Single byte "X"
    //   [0x21] Single byte "Y"
    //   [0x22] Single byte "Z"
    //   [0x23] 17 possible previous repetitions of length at least 0x10 bytes:
    //          - Repetition of 0x10 bytes from [0x00] "EEEEEEEEEEEEEEEE"
    //          - Repetition of 0x10 bytes from [0x01] "EEEEEEEEEEEEEEEE"
    //          - Repetition of 0x10 bytes from [0x02] "EEEEEEEEEEEEEEEE"
    //          ...
    //          - Repetition of 0x10 bytes from [0x0F] "EEEEEEEEEEEEEEEE"
    //          - Repetition of 0x1C bytes from [0x10] "EEEEEEEEEEEEEEEEQQQQQQQQQQQQ"
    //          The last repetition is the best one.
    //

    pWork.offs09BC[0] = 0xFFFF;
    pWork.offs09BC[1] = 0x0000;
    di_val = 0;

    // Note: I failed to figure out what does the table "offs09BC" mean.
    // If anyone has an idea, let me know to zezula_at_volny_dot_cz
    for(offs_in_rep = 1; offs_in_rep < rep_length; )
    {
        if(input_data[offs_in_rep] != input_data[di_val])
        {
            di_val = pWork.offs09BC[di_val];
            if(di_val != 0xFFFF)
                continue;
        }
        pWork.offs09BC[++offs_in_rep] = ++di_val;
    }

    //
    // Now go through all the repetitions from the first found one
    // to the current input data, and check if any of them migh be
    // a start of a greater sequence match.
    //

    prev_repetition = pWork.work_buff + phash_offs[0];
    prev_rep_end = prev_repetition + rep_length;
    rep_length2 = rep_length;

    for(;;)
    {
        rep_length2 = pWork.offs09BC[rep_length2];
        if(rep_length2 == 0xFFFF)
            rep_length2 = 0;

        // Get the pointer to the previous repetition
        phash_offs = pWork.phash_offs + phash_offs_index;

        // Skip those repetitions that don't reach the end
        // of the first found repetition
        do
        {
            phash_offs++;
            phash_offs_index++;
            prev_repetition = pWork.work_buff + *phash_offs;
            if(prev_repetition >= repetition_limit)
                return rep_length;
        }
        while(prev_repetition + rep_length2 < prev_rep_end);

        // Verify if the last but one byte from the repetition matches
        // the last but one byte from the input data.
        // If not, find a next repetition
        pre_last_byte = input_data[rep_length - 2];
        if(pre_last_byte == prev_repetition[rep_length - 2])
        {
            // If the new repetition reaches beyond the end
            // of previously found repetition, reset the repetition length to zero.
            if(prev_repetition + rep_length2 != prev_rep_end)
            {
                prev_rep_end = prev_repetition;
                rep_length2 = 0;
            }
        }
        else
        {
            phash_offs = pWork.phash_offs + phash_offs_index;
            do
            {
                phash_offs++;
                phash_offs_index++;
                prev_repetition = pWork.work_buff + *phash_offs;
                if(prev_repetition >= repetition_limit)
                    return rep_length;
            }
            while(prev_repetition[rep_length - 2] != pre_last_byte || prev_repetition[0] != input_data[0]);

            // Reset the length of the repetition to 2 bytes only
            prev_rep_end = prev_repetition + 2;
            rep_length2 = 2;
        }

        // Find out how many more characters are equal to the first repetition.
        while(*prev_rep_end == input_data[rep_length2])
        {
            if(++rep_length2 >= 0x204)
                break;
            prev_rep_end++;
        }

        // Is the newly found repetion at least as long as the previous one ?
        if(rep_length2 >= rep_length)
        {
            // Calculate the distance of the new repetition
            pWork.distance = (unsigned int)(input_data - prev_repetition - 1);
            if((rep_length = rep_length2) == 0x204)
                return rep_length;

            // Update the additional elements in the "offs09BC" table
            // to reflect new rep length
            while(offs_in_rep < rep_length2)
            {
                if(input_data[offs_in_rep] != input_data[di_val])
                {
                    di_val = pWork.offs09BC[di_val];
                    if(di_val != 0xFFFF)
                        continue;
                }
                pWork.offs09BC[++offs_in_rep] = ++di_val;
            }
        }
    }
  */
}

const WriteCmpData = pWork => {
  let input_data_ended = 0
  let save_rep_length
  const save_distance = 0
  let rep_length
  let phase = 0

  let input_data = makePointerFrom(pWork.work_buff, pWork.dsize_bytes + 0x204) // pointer
  let input_data_end // pointer

  pWork.out_buff = repeat(0, length(pWork.out_buff))
  pWork.out_buff[0] = pWork.ctype
  pWork.out_buff[1] = pWork.dsize_bits
  pWork.out_bytes = 2
  pWork.out_bits = 0

  while (input_data_ended === 0) {
    let bytes_to_load = 0x1000
    let total_loaded = 0
    let bytes_loaded

    // Load the bytes from the input stream, up to 0x1000 bytes
    while (bytes_to_load !== 0) {
      bytes_loaded = pWork.read_buf(
        makePointerFrom(pWork.work_buff, pWork.dsize_bytes + 0x204 + total_loaded),
        getAddressOfValue(bytes_to_load)
      )

      if (bytes_loaded === 0) {
        if (total_loaded === 0 && phase === 0) {
          /*
            goto __Exit;
          */
          input_data_ended = 1
        }
        break
      } else {
        bytes_to_load -= bytes_loaded
        total_loaded += bytes_loaded
      }
    }

    input_data_end = pWork.work_buff + pWork.dsize_bytes + total_loaded
    if (input_data_ended) {
      input_data_end += 0x204
    }

    switch (phase) {
      case 0:
        SortBuffer(pWork, input_data, input_data_end + 1)
        phase++
        if (pWork.dsize_bytes !== 0x1000) {
          phase++
        }
        break
      case 1:
        SortBuffer(pWork, input_data - pWork.dsize_bytes + 0x204, input_data_end + 1)
        phase++
        break
      default:
        SortBuffer(pWork, input_data - pWork.dsize_bytes, input_data_end + 1)
        break
    }

    /*
    // Perform the compression of the current block
    while(input_data < input_data_end)
    {
        // Find if the current byte sequence wasn't there before.
        rep_length = FindRep(pWork, input_data);
        while(rep_length != 0)
        {
            // If we found repetition of 2 bytes, that is 0x100 or fuhrter back,
            // don't bother. Storing the distance of 0x100 bytes would actually
            // take more space than storing the 2 bytes as-is.
            if(rep_length == 2 && pWork.distance >= 0x100)
                break;

            // When we are at the end of the input data, we cannot allow
            // the repetition to go past the end of the input data.
            if(input_data_ended && input_data + rep_length > input_data_end)
            {
                // Shorten the repetition length so that it only covers valid data
                rep_length = (unsigned long)(input_data_end - input_data);
                if(rep_length < 2)
                    break;

                // If we got repetition of 2 bytes, that is 0x100 or more backward, don't bother
                if(rep_length == 2 && pWork.distance >= 0x100)
                    break;
                goto __FlushRepetition;
            }

            if(rep_length >= 8 || input_data + 1 >= input_data_end)
                goto __FlushRepetition;

            // Try to find better repetition 1 byte later.
            // Example: "ARROCKFORT" "AROCKFORT"
            // When "input_data" points to the second string, FindRep
            // returns the occurence of "AR". But there is longer repetition "ROCKFORT",
            // beginning 1 byte after.
            save_rep_length = rep_length;
            save_distance = pWork.distance;
            rep_length = FindRep(pWork, input_data + 1);

            // Only use the new repetition if it's length is greater than the previous one
            if(rep_length > save_rep_length)
            {
                // If the new repetition if only 1 byte better
                // and the previous distance is less than 0x80 bytes, use the previous repetition
                if(rep_length > save_rep_length + 1 || save_distance > 0x80)
                {
                    // Flush one byte, so that input_data will point to the secondary repetition
                    OutputBits(pWork, pWork.nChBits[*input_data], pWork.nChCodes[*input_data]);
                    input_data++;
                    continue;
                }
            }

            // Revert to the previous repetition
            rep_length = save_rep_length;
            pWork.distance = save_distance;

            __FlushRepetition:

            OutputBits(pWork, pWork.nChBits[rep_length + 0xFE], pWork.nChCodes[rep_length + 0xFE]);
            if(rep_length == 2)
            {
                OutputBits(pWork, pWork.dist_bits[pWork.distance >> 2],
                                  pWork.dist_codes[pWork.distance >> 2]);
                OutputBits(pWork, 2, pWork.distance & 3);
            }
            else
            {
                OutputBits(pWork, pWork.dist_bits[pWork.distance >> pWork.dsize_bits],
                                  pWork.dist_codes[pWork.distance >> pWork.dsize_bits]);
                OutputBits(pWork, pWork.dsize_bits, pWork.dsize_mask & pWork.distance);
            }

            // Move the begin of the input data by the length of the repetition
            input_data += rep_length;
            goto _00402252;
        }

        // If there was no previous repetition for the current position in the input data,
        // just output the 9-bit literal for the one character
        OutputBits(pWork, pWork.nChBits[*input_data], pWork.nChCodes[*input_data]);
        input_data++;
_00402252:;
    }
    */

    if (input_data_ended === 0) {
      input_data -= 0x1000
      // watch out, copyWithin() is mutating work_buff!
      pWork.work_buff.copyWithin(0, 0x1000, 0x1000 + pWork.dsize_bytes + 0x204)
    }
  }

  __Exit: OutputBits(pWork, pWork.nChBits[0x305], pWork.nChCodes[0x305])

  if (pWork.out_bits !== 0) {
    pWork.out_bytes++
  }
  pWork.write_buf(pWork.out_buff, getAddressOfValue(pWork.out_bytes))
}

const implode = (read_buf, write_buf, type, dsize) => {
  const pWork = {
    distance: 0,
    out_bytes: 0,
    out_bits: 0,
    dsize_bits: 4,
    dsize_mask: 0x0f,
    ctype: getValueFromPointer(type),
    dsize_bytes: getValueFromPointer(dsize),
    dist_bits: repeat(0, 0x40),
    dist_codes: repeat(0, 0x40),
    nChBits: repeat(0, 0x306),
    nChCodes: repeat(0, 0x306),
    offs09AE: 0,
    read_buf: copyPointer(read_buf),
    write_buf: copyPointer(write_buf),
    offs09BC: repeat(0, 0x204),
    offs0DC4: 0,
    phash_to_index: repeat(0, 0x900),
    phash_to_index_end: 0,
    out_buff: repeat(0, 0x802),
    work_buff: repeat(0, 0x2204),
    phash_offs: repeat(0, 0x2204)
  }

  let nChCode
  let nCount

  switch (getValueFromPointer(dsize)) {
    case CMP_IMPLODE_DICT_SIZE3:
      pWork.dsize_bits += 2
      pWork.dsize_mask |= 0x30
      break
    case CMP_IMPLODE_DICT_SIZE2:
      pWork.dsize_bits++
      pWork.dsize_mask |= 0x10
      break
    case CMP_IMPLODE_DICT_SIZE1:
      break
    default:
      return CMP_INVALID_DICTSIZE
  }

  switch (getValueFromPointer(type)) {
    case BINARY_COMPRESSION:
      for (nChCode = 0, nCount = 0; nCount < 0x100; nCount++) {
        pWork.nChBits[nCount] = 9
        pWork.nChCodes[nCount] = nChCode
        nChCode = (nChCode & 0x0000ffff) + 2
      }
      break
    case ASCII_COMPRESSION:
      for (nCount = 0; nCount < 0x100; nCount++) {
        pWork.nChBits[nCount] = ChBitsAsc[nCount] + 1
        pWork.nChCodes[nCount] = ChCodeAsc[nCount] * 2
      }
      break

    default:
      return CMP_INVALID_MODE
  }

  for (let i = 0; i < 0x10; i++) {
    if (1 << ExLenBits[i]) {
      for (let nCount2 = 0; nCount2 < 1 << ExLenBits[i]; nCount2++) {
        pWork.nChBits[nCount] = ExLenBits[i] + LenBits[i] + 1
        pWork.nChCodes[nCount] = (nCount2 << (LenBits[i] + 1)) | ((LenCode[i] & 0xffff00ff) * 2) | 1
        nCount++
      }
    }
  }

  pWork.dist_codes = clone(DistCode)
  pWork.dist_bits = clone(DistBits)
  WriteCmpData(pWork)

  return CMP_NO_ERROR
}

/* eslint-enable */

export default implode
