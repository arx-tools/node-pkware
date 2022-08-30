export function isNumber(x: any): boolean
export function isString(x: any): boolean
export function isFunction(x: any): boolean
export function noop(): void
export function isPlainObject(x: any): boolean
export function isBetween(min: number, max: number, num: number): boolean
export function nBitsOfOnes(numberOfBits: number): number
export function maskBits(numberOfBits: number, number: number): number
export function getLowestNBits(numberOfBits: number, number: number): number
export function isFullHexString(str: string): boolean
export function toHex(num: number, digits?: number, withoutPrefix?: boolean): string
export function mergeSparseArrays<T>(a: T[], b: T[]): T[]
export function parseNumberString(n: string, defaultValue?: number): number
export function getPackageVersion(): Promise<string>
export function fileExists(filename: string): Promise<boolean>
