export const repeat = <T>(value: T, repetitions: number): T[] => {
  return Array(repetitions).fill(value)
}

export const clamp = (min: number, max: number, n: number) => {
  if (n < min) {
    return min
  }
  if (n > max) {
    return max
  }
  return n
}

export const clone = <T>(data: T): T => {
  return JSON.parse(JSON.stringify(data))
}

export const isFunction = (x: any): x is Function => {
  return Object.prototype.toString.call(x) === '[object Function]'
}

export const nBitsOfOnes = (numberOfBits: number) => {
  if (!Number.isInteger(numberOfBits) || numberOfBits < 0) {
    return 0
  }

  return (1 << numberOfBits) - 1
}

export const getLowestNBits = (numberOfBits: number, number: number) => {
  return number & nBitsOfOnes(numberOfBits)
}

export const toHex = (num: number, digits: number = 0, withoutPrefix: boolean = false) => {
  if (!Number.isInteger(num) || !Number.isInteger(digits) || digits < 0) {
    return ''
  }

  const prefix = withoutPrefix ? '' : '0x'

  return `${prefix}${num.toString(16).padStart(digits, '0')}`
}

export const mergeSparseArrays = <T>(a: T[], b: T[]) => {
  const result = [...b, ...(b.length < a.length ? repeat(undefined, a.length - b.length) : [])]

  for (let i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'undefined') {
      result[i] = a[i]
    }
  }

  return result
}

export const last = <T>(arr: T[]) => {
  return arr[arr.length - 1]
}

export const unfold = <T, TResult>(fn: (seed: T) => [TResult, T] | false, seed: T): TResult[] => {
  let pair = fn(seed)
  const result: TResult[] = []
  while (pair && pair.length) {
    result[result.length] = pair[0]
    pair = fn(pair[1])
  }
  return result
}

export const evenAndRemainder = (divisor: number, n: number): [number, number] => {
  return [Math.floor(n / divisor), n % divisor]
}
