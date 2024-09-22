export function repeat<T>(value: T, repetitions: number): T[] {
  const values: T[] = []
  for (let i = 0; i < repetitions; i++) {
    values.push(value)
  }

  return values
}

export function clamp(min: number, max: number, n: number): number {
  if (n < min) {
    return min
  }

  if (n > max) {
    return max
  }

  return n
}

export function isFunction(x: any): x is Function {
  return Object.prototype.toString.call(x) === '[object Function]'
}

export function nBitsOfOnes(numberOfBits: number): number {
  if (!Number.isInteger(numberOfBits) || numberOfBits < 0) {
    return 0
  }

  return (1 << numberOfBits) - 1
}

export function getLowestNBits(numberOfBits: number, number: number): number {
  return number & nBitsOfOnes(numberOfBits)
}

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

export function mergeSparseArrays<T>(a: T[], b: T[]): (T | undefined)[] {
  const result: (T | undefined)[] = [...b]
  if (b.length < a.length) {
    result.push(...repeat(undefined, a.length - b.length))
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== undefined) {
      result[i] = a[i]
    }
  }

  return result
}

export function unfold<T, TResult>(fn: (seed: T) => [TResult, T] | false, seed: T): TResult[] {
  let pair = fn(seed)
  const result: TResult[] = []
  while (pair && pair.length > 0) {
    result[result.length] = pair[0]
    pair = fn(pair[1])
  }

  return result
}

export function evenAndRemainder(divisor: number, n: number): [number, number] {
  return [Math.floor(n / divisor), n % divisor]
}
