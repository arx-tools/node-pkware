import { Handler } from './Shared'

export function isClass(obj: any): obj is Object
export function buffersShouldEqual(expected: Buffer, result: Buffer, offset?: number, displayAsHex?: boolean): void
export function bufferToString(buffer: Buffer, limit?: number): string
export function transformToABC(): Handler
