/**
 * Compression types for implode
 */
export enum Compression {
  Unknown = -1,
  Binary = 0,
  Ascii = 1,
}

/**
 * Dictionary sizes for implode, determines how well the file get compressed.
 *
 * Small dictionary size means less memory to lookback in data for repetitions,
 * meaning it will be less effective, the file stays larger, less compressed.
 * On the other hand, large compression allows more lookback allowing more effective
 * compression, thus generating smaller, more compressed files.
 */
export enum DictionarySize {
  Unknown = -1,
  Small = 4,
  Medium = 5,
  Large = 6,
}

export const EMPTY_BUFFER = Buffer.from([])

export const LONGEST_ALLOWED_REPETITION = 0x2_04

export const LITERAL_END_STREAM = 0x3_05

// prettier-ignore
export const DistCode = [
  0x03, 0x0D, 0x05, 0x19, 0x09, 0x11, 0x01, 0x3E, 0x1E, 0x2E, 0x0E, 0x36, 0x16, 0x26, 0x06, 0x3A,
  0x1A, 0x2A, 0x0A, 0x32, 0x12, 0x22, 0x42, 0x02, 0x7C, 0x3C, 0x5C, 0x1C, 0x6C, 0x2C, 0x4C, 0x0C,
  0x74, 0x34, 0x54, 0x14, 0x64, 0x24, 0x44, 0x04, 0x78, 0x38, 0x58, 0x18, 0x68, 0x28, 0x48, 0x08,
  0xF0, 0x70, 0xB0, 0x30, 0xD0, 0x50, 0x90, 0x10, 0xE0, 0x60, 0xA0, 0x20, 0xC0, 0x40, 0x80, 0x00
]

// prettier-ignore
export const DistBits = [
  0x02, 0x04, 0x04, 0x05, 0x05, 0x05, 0x05, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08
]

// prettier-ignore
export const LenBits = [
  0x03, 0x02, 0x03, 0x03, 0x04, 0x04, 0x04, 0x05, 0x05, 0x05, 0x05, 0x06, 0x06, 0x06, 0x07, 0x07
]

// prettier-ignore
export const LenCode = [
  0x05, 0x03, 0x01, 0x06, 0x0a, 0x02, 0x0c, 0x14, 0x04, 0x18, 0x08, 0x30, 0x10, 0x20, 0x40, 0x00
]

// prettier-ignore
export const ExLenBits = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
]

// prettier-ignore
export const LenBase = [
  0x00_00, 0x00_01, 0x00_02, 0x00_03, 0x00_04, 0x00_05, 0x00_06, 0x00_07,
  0x00_08, 0x00_0A, 0x00_0E, 0x00_16, 0x00_26, 0x00_46, 0x00_86, 0x01_06
]

// prettier-ignore
export const ChBitsAsc = [
  0x0B, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x08, 0x07, 0x0C, 0x0C, 0x07, 0x0C, 0x0C,
  0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0D, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C,
  0x04, 0x0A, 0x08, 0x0C, 0x0A, 0x0C, 0x0A, 0x08, 0x07, 0x07, 0x08, 0x09, 0x07, 0x06, 0x07, 0x08,
  0x07, 0x06, 0x07, 0x07, 0x07, 0x07, 0x08, 0x07, 0x07, 0x08, 0x08, 0x0C, 0x0B, 0x07, 0x09, 0x0B,
  0x0C, 0x06, 0x07, 0x06, 0x06, 0x05, 0x07, 0x08, 0x08, 0x06, 0x0B, 0x09, 0x06, 0x07, 0x06, 0x06,
  0x07, 0x0B, 0x06, 0x06, 0x06, 0x07, 0x09, 0x08, 0x09, 0x09, 0x0B, 0x08, 0x0B, 0x09, 0x0C, 0x08,
  0x0C, 0x05, 0x06, 0x06, 0x06, 0x05, 0x06, 0x06, 0x06, 0x05, 0x0B, 0x07, 0x05, 0x06, 0x05, 0x05,
  0x06, 0x0A, 0x05, 0x05, 0x05, 0x05, 0x08, 0x07, 0x08, 0x08, 0x0A, 0x0B, 0x0B, 0x0C, 0x0C, 0x0C,
  0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D,
  0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D,
  0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D,
  0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C,
  0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C,
  0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C,
  0x0D, 0x0C, 0x0D, 0x0D, 0x0D, 0x0C, 0x0D, 0x0D, 0x0D, 0x0C, 0x0D, 0x0D, 0x0D, 0x0D, 0x0C, 0x0D,
  0x0D, 0x0D, 0x0C, 0x0C, 0x0C, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D
]

// prettier-ignore
export const ChCodeAsc = [
  0x04_90, 0x0F_E0, 0x07_E0, 0x0B_E0, 0x03_E0, 0x0D_E0, 0x05_E0, 0x09_E0,
  0x01_E0, 0x00_B8, 0x00_62, 0x0E_E0, 0x06_E0, 0x00_22, 0x0A_E0, 0x02_E0,
  0x0C_E0, 0x04_E0, 0x08_E0, 0x00_E0, 0x0F_60, 0x07_60, 0x0B_60, 0x03_60,
  0x0D_60, 0x05_60, 0x12_40, 0x09_60, 0x01_60, 0x0E_60, 0x06_60, 0x0A_60,
  0x00_0F, 0x02_50, 0x00_38, 0x02_60, 0x00_50, 0x0C_60, 0x03_90, 0x00_D8,
  0x00_42, 0x00_02, 0x00_58, 0x01_B0, 0x00_7C, 0x00_29, 0x00_3C, 0x00_98,
  0x00_5C, 0x00_09, 0x00_1C, 0x00_6C, 0x00_2C, 0x00_4C, 0x00_18, 0x00_0C,
  0x00_74, 0x00_E8, 0x00_68, 0x04_60, 0x00_90, 0x00_34, 0x00_B0, 0x07_10,
  0x08_60, 0x00_31, 0x00_54, 0x00_11, 0x00_21, 0x00_17, 0x00_14, 0x00_A8,
  0x00_28, 0x00_01, 0x03_10, 0x01_30, 0x00_3E, 0x00_64, 0x00_1E, 0x00_2E,
  0x00_24, 0x05_10, 0x00_0E, 0x00_36, 0x00_16, 0x00_44, 0x00_30, 0x00_C8,
  0x01_D0, 0x00_D0, 0x01_10, 0x00_48, 0x06_10, 0x01_50, 0x00_60, 0x00_88,
  0x0F_A0, 0x00_07, 0x00_26, 0x00_06, 0x00_3A, 0x00_1B, 0x00_1A, 0x00_2A,
  0x00_0A, 0x00_0B, 0x02_10, 0x00_04, 0x00_13, 0x00_32, 0x00_03, 0x00_1D,
  0x00_12, 0x01_90, 0x00_0D, 0x00_15, 0x00_05, 0x00_19, 0x00_08, 0x00_78,
  0x00_F0, 0x00_70, 0x02_90, 0x04_10, 0x00_10, 0x07_A0, 0x0B_A0, 0x03_A0,
  0x02_40, 0x1C_40, 0x0C_40, 0x14_40, 0x04_40, 0x18_40, 0x08_40, 0x10_40,
  0x00_40, 0x1F_80, 0x0F_80, 0x17_80, 0x07_80, 0x1B_80, 0x0B_80, 0x13_80,
  0x03_80, 0x1D_80, 0x0D_80, 0x15_80, 0x05_80, 0x19_80, 0x09_80, 0x11_80,
  0x01_80, 0x1E_80, 0x0E_80, 0x16_80, 0x06_80, 0x1A_80, 0x0A_80, 0x12_80,
  0x02_80, 0x1C_80, 0x0C_80, 0x14_80, 0x04_80, 0x18_80, 0x08_80, 0x10_80,
  0x00_80, 0x1F_00, 0x0F_00, 0x17_00, 0x07_00, 0x1B_00, 0x0B_00, 0x13_00,
  0x0D_A0, 0x05_A0, 0x09_A0, 0x01_A0, 0x0E_A0, 0x06_A0, 0x0A_A0, 0x02_A0,
  0x0C_A0, 0x04_A0, 0x08_A0, 0x00_A0, 0x0F_20, 0x07_20, 0x0B_20, 0x03_20,
  0x0D_20, 0x05_20, 0x09_20, 0x01_20, 0x0E_20, 0x06_20, 0x0A_20, 0x02_20,
  0x0C_20, 0x04_20, 0x08_20, 0x00_20, 0x0F_C0, 0x07_C0, 0x0B_C0, 0x03_C0,
  0x0D_C0, 0x05_C0, 0x09_C0, 0x01_C0, 0x0E_C0, 0x06_C0, 0x0A_C0, 0x02_C0,
  0x0C_C0, 0x04_C0, 0x08_C0, 0x00_C0, 0x0F_40, 0x07_40, 0x0B_40, 0x03_40,
  0x03_00, 0x0D_40, 0x1D_00, 0x0D_00, 0x15_00, 0x05_40, 0x05_00, 0x19_00,
  0x09_00, 0x09_40, 0x11_00, 0x01_00, 0x1E_00, 0x0E_00, 0x01_40, 0x16_00,
  0x06_00, 0x1A_00, 0x0E_40, 0x06_40, 0x0A_40, 0x0A_00, 0x12_00, 0x02_00,
  0x1C_00, 0x0C_00, 0x14_00, 0x04_00, 0x18_00, 0x08_00, 0x10_00, 0x00_00
]
