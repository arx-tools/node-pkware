import { Transform, Writable } from 'stream'
import { Callback } from './Shared'

type QuasiTransformConstructorParameter = (
  obj: {
    handler: QuasiTransformConstructorParameter
    handle(chunk: Buffer, encoding: string): Promise<void>
  },
  chunk: Buffer,
  encoding: string
) => void

/**
 * Creates a "**predicate**" function, that awaits Buffers, keeps an internal counter of the bytes from them and splits the appropriate buffer at the given index.
 * Splitting is done by returning an array with `[left: Buffer, right: Buffer, isLeftDone: bool]`.
 * If you want to split data at the 100th byte and you keep feeding 60 byte long buffers to the function returned by `splitAt(100)`, then it will return arrays in the following manner:
 * 1. `[inputBuffer, emptyBuffer, false]`
 * 2. `[inputBuffer.slice(0, 40), inputBuffer.slice(40, 60), true]`
 * 3. `[emptyBuffer, inputBuffer, true]`
 * 4. `[emptyBuffer, inputBuffer, true]`
 * 5. ... and so on
 * @param index at which to split the buffer
 */
export function splitAt(index: number): (chunk: Buffer) => null | [Buffer, Buffer, boolean]

/**
 * A `transform._transform` type function, which lets the input chunks through without any change
 */
export function transformIdentity(): (chunk: Buffer, encoding: unknown, callback: Callback) => void

/**
 * A `transform._transform` type function, which for every input chunk will output an empty buffer
 */
export function transformEmpty(): (chunk: unknown, encoding: unknown, callback: Callback) => void

/**
 * Takes a `transform._transform` type function and turns it into a Transform stream instance
 * @param handler a transform._transform type function
 * @returns a Transform stream instance
 */
export function through(handler: Exclude<ConstructorParameters<typeof Transform>[0], undefined>['transform']): Transform

/**
 * Higher order function for introducing conditional logic to `transform._transform` functions.
 * This is used internally to handle offsets for `explode()`.
 * @param predicate
 * @param leftHandler
 * @param rightHandler
 * @returns `transform._transform`
 */
export function transformSplitBy(
  predicate: (chunk: Buffer) => [Buffer, Buffer, boolean],
  leftHandler: QuasiTransformConstructorParameter,
  rightHandler: QuasiTransformConstructorParameter
): (chunk: Buffer, encoding: string, callback: Callback) => void

/**
 * Data can be piped to the returned function from a stream and it will concatenate all chunks into a single buffer.
 * @param done a callback function, which will receive the concatenated buffer as a parameter
 */
export function streamToBuffer(done: (heap: Buffer) => void): Writable
