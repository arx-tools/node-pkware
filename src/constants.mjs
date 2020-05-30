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

export const CMP_BUFFER_SIZE = 36312 // Size of compression structure
export const EXP_BUFFER_SIZE = 12596 // Size of decompression structure

const cType = {
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

/*
Compression structure
{
  unsigned int   distance;                // 0000: Backward distance of the currently found repetition, decreased by 1
  unsigned int   out_bytes;               // 0004: # bytes available in out_buff            
  unsigned int   out_bits;                // 0008: # of bits available in the last out byte
  unsigned int   dsize_bits;              // 000C: Number of bits needed for dictionary size. 4 = 0x400, 5 = 0x800, 6 = 0x1000
  unsigned int   dsize_mask;              // 0010: Bit mask for dictionary. 0x0F = 0x400, 0x1F = 0x800, 0x3F = 0x1000
  unsigned int   ctype;                   // 0014: Compression type (CMP_ASCII or CMP_BINARY)
  unsigned int   dsize_bytes;             // 0018: Dictionary size in bytes
  unsigned char  dist_bits[0x40];         // 001C: Distance bits
  unsigned char  dist_codes[0x40];        // 005C: Distance codes
  unsigned char  nChBits[0x306];          // 009C: Table of literal bit lengths to be put to the output stream
  unsigned short nChCodes[0x306];         // 03A2: Table of literal codes to be put to the output stream
  unsigned short offs09AE;                // 09AE: 

  void         * param;                   // 09B0: User parameter
  unsigned int (*read_buf)(char *buf, unsigned int *size, void *param);  // 9B4
  void         (*write_buf)(char *buf, unsigned int *size, void *param); // 9B8

  unsigned short offs09BC[0x204];         // 09BC:
  unsigned long  offs0DC4;                // 0DC4: 
  unsigned short phash_to_index[0x900];   // 0DC8: Array of indexes (one for each PAIR_HASH) to the "pair_hash_offsets" table
  unsigned short phash_to_index_end;      // 1FC8: End marker for "phash_to_index" table
  char           out_buff[0x802];         // 1FCA: Compressed data
  unsigned char  work_buff[0x2204];       // 27CC: Work buffer
                                          //  + DICT_OFFSET  => Dictionary
                                          //  + UNCMP_OFFSET => Uncompressed data
  unsigned short phash_offs[0x2204];      // 49D0: Table of offsets for each PAIR_HASH
}
*/

export const getTCmpStruct = buffer => {
  const reader = new DataView(buffer)

  return {
    distance:           reader[cType.unsigned.int](0x0000),
    out_bytes:          reader[cType.unsigned.int](0x0004),
    out_bits:           reader[cType.unsigned.int](0x0008),
    dsize_bits:         reader[cType.unsigned.int](0x000c),
    dsize_mask:         reader[cType.unsigned.int](0x0010),
    ctype:              reader[cType.unsigned.int](0x0014),
    dsize_bytes:        reader[cType.unsigned.int](0x0018),
    dist_bits:          times(idx => reader[cType.unsigned.char](0x001c + idx), 0x40),
    dist_codes:         times(idx => reader[cType.unsigned.char](0x005c + idx), 0x40),
    nChBits:            times(idx => reader[cType.unsigned.char](0x009c + idx), 0x306),
    nChCodes:           times(idx => reader[cType.unsigned.short](0x03a2 + idx), 0x306),
    offs09AE:           reader[cType.unsigned.short](0x09ae),
    param:              '?',
    read_buf:           '?',
    write_buf:          '?',
    offs09BC:           times(idx => reader[cType.unsigned.short](0x09bc + idx), 0x204),
    offs0DC4:           reader[cType.unsigned.long](0x0dc4),
    phash_to_index:     times(idx => reader[cType.unsigned.short](0x0dc8 + idx), 0x900),
    phash_to_index_end: reader[cType.unsigned.short](0x1fc8),
    out_buff:           times(idx => reader[cType.signed.char](0x1fca + idx), 0x802),
    work_buff:          times(idx => reader[cType.unsigned.char](0x27cc + idx), 0x2204),
    phash_offs:         times(idx => reader[cType.unsigned.short](0x49d0 + idx), 0x2204)
  }
}

/*
// Decompression structure
{
    unsigned long offs0000;                 // 0000
    unsigned long ctype;                    // 0004: Compression type (CMP_BINARY or CMP_ASCII)
    unsigned long outputPos;                // 0008: Position in output buffer
    unsigned long dsize_bits;               // 000C: Dict size (4, 5, 6 for 0x400, 0x800, 0x1000)
    unsigned long dsize_mask;               // 0010: Dict size bitmask (0x0F, 0x1F, 0x3F for 0x400, 0x800, 0x1000)
    unsigned long bit_buff;                 // 0014: 16-bit buffer for processing input data
    unsigned long extra_bits;               // 0018: Number of extra (above 8) bits in bit buffer
    unsigned int  in_pos;                   // 001C: Position in in_buff
    unsigned long in_bytes;                 // 0020: Number of bytes in input buffer
    void        * param;                    // 0024: Custom parameter
    unsigned int (*read_buf)(char *buf, unsigned int *size, void *param); // Pointer to function that reads data from the input stream
    void         (*write_buf)(char *buf, unsigned int *size, void *param);// Pointer to function that writes data to the output stream

    unsigned char out_buff[0x2204];         // 0030: Output circle buffer.
                                            //       0x0000 - 0x0FFF: Previous uncompressed data, kept for repetitions
                                            //       0x1000 - 0x1FFF: Currently decompressed data
                                            //       0x2000 - 0x2203: Reserve space for the longest possible repetition
    unsigned char in_buff[0x800];           // 2234: Buffer for data to be decompressed
    unsigned char DistPosCodes[0x100];      // 2A34: Table of distance position codes
    unsigned char LengthCodes[0x100];       // 2B34: Table of length codes
    unsigned char offs2C34[0x100];          // 2C34: Buffer for 
    unsigned char offs2D34[0x100];          // 2D34: Buffer for 
    unsigned char offs2E34[0x80];           // 2E34: Buffer for 
    unsigned char offs2EB4[0x100];          // 2EB4: Buffer for 
    unsigned char ChBitsAsc[0x100];         // 2FB4: Buffer for 
    unsigned char DistBits[0x40];           // 30B4: Numbers of bytes to skip copied block length
    unsigned char LenBits[0x10];            // 30F4: Numbers of bits for skip copied block length
    unsigned char ExLenBits[0x10];          // 3104: Number of valid bits for copied block
    unsigned short LenBase[0x10];           // 3114: Buffer for 
}
*/

export const getTDcmpStruct = buffer => {
  const reader = new DataView(buffer)

  return {
    offs0000:     reader[cType.unsigned.long](0x0000),
    ctype:        reader[cType.unsigned.long](0x0004),
    outputPos:    reader[cType.unsigned.long](0x0008),
    dsize_bits:   reader[cType.unsigned.long](0x000c),
    dsize_mask:   reader[cType.unsigned.long](0x0010),
    bit_buff:     reader[cType.unsigned.long](0x0014),
    extra_bits:   reader[cType.unsigned.long](0x0018),
    in_pos:       reader[cType.unsigned.int](0x001c),
    in_bytes:     reader[cType.unsigned.long](0x0020),
    param:        '?',
    read_buf:     '?',
    write_buf:    '?',
    out_buff:     times(idx => reader[cType.unsigned.char + idx](0x0030 + idx), 0x2204),
    in_buff:      times(idx => reader[cType.unsigned.char + idx](0x2234 + idx), 0x800),
    DistPosCodes: times(idx => reader[cType.unsigned.char + idx](0x2a34), 0x100),
    LengthCodes:  times(idx => reader[cType.unsigned.char + idx](0x2b34), 0x100),
    offs2C34:     times(idx => reader[cType.unsigned.char + idx](0x2c34), 0x100),
    offs2D34:     times(idx => reader[cType.unsigned.char + idx](0x2d34), 0x100),
    offs2E34:     times(idx => reader[cType.unsigned.char + idx](0x2e34), 0x80),
    offs2EB4:     times(idx => reader[cType.unsigned.char + idx](0x2eb4), 0x100),
    ChBitsAsc:    times(idx => reader[cType.unsigned.char + idx](0x2fb4), 0x100),
    DistBits:     times(idx => reader[cType.unsigned.char + idx](0x30b4), 0x40),
    LenBits:      times(idx => reader[cType.unsigned.char + idx](0x30f4), 0x10),
    ExLenBits:    times(idx => reader[cType.unsigned.char + idx](0x3104), 0x10),
    LenBase:      times(idx => reader[cType.unsigned.short](0x3114 + idx), 0x10)
  }
}
