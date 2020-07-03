// placeholder functions, which help readability by replacing special characters
// with meaningful labels
export const getValueFromPointer = x => x
export const copyPointer = x => x
export const getAddressOfValue = x => x
export const makePointerFrom = (startAddress, additions = 0) => startAddress[additions]
export const setValueToPointer = (pointer, newValue) => {}
export const toByteArray = x => {
  // https://stackoverflow.com/a/7571088/1806628
  return x
}
