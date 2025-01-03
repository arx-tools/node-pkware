/**
 * Creates a copy of `value` `repetitions` times into an array:
 *
 * @example
 * ```js
 * repeat(4, 10) -> [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
 * ```
 *
 * Watch out! For reference types (arrays and objects) the repetitions will
 * all point to the same object:
 *
 * ```js
 * const data = { x: 10, y: 20 }
 * const reps = repeat(data, 3) // -> [data, data, data]
 * reps[2].x = 20
 * console.log(data) // -> { x: 20, y: 20 }
 * ```
 */
export function repeat<T>(value: T, repetitions: number): T[] {
  const values: T[] = []
  for (let i = 0; i < repetitions; i++) {
    values.push(value)
  }

  return values
}

/**
 * Makes sure `n` is no smaller than `min` and no greater than `max`:
 *
 * @example
 * ```js
 * clamp(3, 7, 8) === 7
 * clamp(3, 7, 2) === 3
 * clamp(3, 7, 5) === 5
 * ```
 */
export function clamp(min: number, max: number, n: number): number {
  if (n < min) {
    return min
  }

  if (n > max) {
    return max
  }

  return n
}

/**
 * @see https://github.com/ramda/ramda/blob/master/source/internal/_isFunction.js
 */
export function isFunction(x: any): x is Function {
  return Object.prototype.toString.call(x) === '[object Function]'
}

/**
 * Creates `numberOfBits` number of 1s:
 *
 * @example
 * ```js
 * nBitsOfOnes(3) === 0b111
 * nBitsOfOnes(7) === 0b111_1111
 * ```
 */
export function nBitsOfOnes(numberOfBits: number): number {
  if (!Number.isInteger(numberOfBits) || numberOfBits < 0) {
    return 0
  }

  return (1 << numberOfBits) - 1
}

/**
 * Keeps the `numberOfBits` lower bits of `number` as is and discards higher bits:
 *
 * ```
 * getLowestNBitsOf(0bXXXX_XXXX, 3) === 0b0000_0XXX
 * ```
 *
 * @example
 * ```js
 * getLowestNBitsOf(0b1101_1011, 4) === 0b0000_1011
 * getLowestNBitsOf(0b1101_1011, 3) === 0b0000_0011
 * ```
 */
export function getLowestNBitsOf(number: number, numberOfBits: number): number {
  return number & nBitsOfOnes(numberOfBits)
}

/**
 * Converts a decimal integer into a hexadecimal number in a string with or without prefix and padding zeros
 *
 * @example
 * ```js
 * toHex(17) === "0x11"
 * toHex(17, 5) === "0x00011"
 * toHex(17, 5, false) === "00011"
 * toHex(17, 0, false) === "11"
 *
 * // invalid case: 1st parameter is not an integer
 * toHex(14.632) === ""
 *
 * // invalid case: 2nd parameter is not an integer
 * toHex(50, 3.2) === ""
 *
 * // invalid case: 2nd parameter is negative
 * toHex(24, -5) === ""
 * ```
 */
export function toHex(num: number, digits: number = 0, withoutPrefix: boolean = false): string {
  if (!Number.isInteger(num) || !Number.isInteger(digits) || digits < 0) {
    return ''
  }

  let prefix = '0x'
  if (withoutPrefix) {
    prefix = ''
  }

  return `${prefix}${num.toString(16).padStart(digits, '0')}`
}

/**
 * A sparse array is an array with holes in it:
 *
 * @example
 * ```js
 * const sparseArray = [1,, 3,, 5]
 *
 * // same as:
 * const sparseArray = []
 * sparseArray[0] = 1
 * sparseArray[2] = 3
 * sparseArray[4] = 5
 * ```
 *
 * This function fills in holes in the 1st parameter array from the 2nd parameter array:
 *
 * @example
 * ```js
 * const a = [1,, 2,, 3]
 * const b = [,, 12, 13, 14]
 * mergeSparseArrays(a, b) // -> [1, undefined, 2, 13, 3]
 * ```
 */
export function mergeSparseArrays<T>(a: T[], b: T[]): (T | undefined)[] {
  let result: (T | undefined)[]

  if (b.length < a.length) {
    result = [...b, ...repeat(undefined, a.length - b.length)]
  } else {
    result = [...b]
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== undefined) {
      result[i] = a[i]
    }
  }

  return result
}

/**
 * Builds a list from a seed value. Accepts an iterator function, which returns
 * either false to stop iteration or an array of length 2 containing the value
 * to add to the resulting list and the seed to be used in the next call to the
 * iterator function.
 *
 * @example
 * ```js
 * // while n is < 50:
 * //  - turn current value to negative
 * //  - add 10 to the next value
 * function fn(n) {
 *   if (n > 50) {
 *     return false
 *   }
 *
 *   return [-n, n + 10]
 * }
 *
 * unfold(fn, 10) // -> [-10, -20, -30, -40, -50]
 * ```
 *
 * @see https://github.com/ramda/ramda/blob/master/source/unfold.js
 */
export function unfold<T, TResult>(fn: (seed: T) => [result: TResult, nextSeed: T] | false, seed: T): TResult[] {
  let pair = fn(seed)
  const result: TResult[] = []

  while (pair && pair.length > 0) {
    result[result.length] = pair[0]
    pair = fn(pair[1])
  }

  return result
}

/**
 * @example
 * ```js
 * quotientAndRemainder(20, 3) // -> [6, 2]
 * ```
 */
export function quotientAndRemainder(dividend: number, divisor: number): [quotient: number, remainder: number] {
  return [Math.floor(dividend / divisor), dividend % divisor]
}

/**
 * @see https://stackoverflow.com/a/49129872/1806628
 */
export function concatArrayBuffers(buffers: ArrayBufferLike[]): ArrayBufferLike {
  if (buffers.length === 0) {
    return new ArrayBuffer(0)
  }

  const totalLength = buffers.reduce((sum, buffer) => {
    return sum + buffer.byteLength
  }, 0)

  const combinedBuffer = new Uint8Array(totalLength)

  let offset = 0
  buffers.forEach((buffer) => {
    combinedBuffer.set(new Uint8Array(buffer), offset)
    offset = offset + buffer.byteLength
  })

  return combinedBuffer.buffer
}
