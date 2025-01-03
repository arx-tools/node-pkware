import { Buffer } from 'node:buffer'
import { Transform, Writable, type TransformCallback } from 'node:stream'
import { promisify } from 'node:util'
import { isFunction } from '@src/functions.js'
import { ExpandingBuffer } from '@src/ExpandingBuffer.js'

export type StreamHandler = (
  this: Transform,
  chunk: Buffer,
  encoding: NodeJS.BufferEncoding,
  callback: TransformCallback,
) => void | Promise<void>

type TransformPredicate = (chunk: Buffer) => [left: Buffer, right: Buffer, isLeftDone: boolean]

class QuasiTransform {
  _flush?: (callback: TransformCallback) => void

  readonly #handler: StreamHandler

  constructor(handler: StreamHandler) {
    this.#handler = handler
  }

  async handle(chunk: Buffer, encoding: NodeJS.BufferEncoding): Promise<Buffer> {
    return promisify(this.#handler).call(this, chunk, encoding) as Promise<Buffer>
  }
}

/**
 * Creates a {@link TransformPredicate} function, that awaits Buffers, keeps an internal counter
 * of the bytes from them and splits the appropriate buffer at the given index.
 *
 * Splitting is done by returning an array with `[left: Buffer, right: Buffer, isLeftDone: bool]`.
 *
 * If you want to split data at the 100th byte and you keep feeding 60 byte long buffers to the function
 * returned by `splitAt(100)`, then it will return arrays in the following manner:
 * 1. `[inputBuffer, emptyBuffer, false]`
 * 2. `[inputBuffer.slice(0, 40), inputBuffer.slice(40, 60), true]`
 * 3. `[emptyBuffer, inputBuffer, true]`
 * 4. `[emptyBuffer, inputBuffer, true]`
 * 5. ... and so on
 * @param index - a positive integer at which to split the buffer
 */
export function splitAt(index: number): TransformPredicate {
  let cntr = 0

  return (chunk: Buffer): ReturnType<TransformPredicate> => {
    let left: Buffer
    let right: Buffer
    let isLeftDone: boolean

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = Buffer.from([])
      right = chunk
      isLeftDone = true
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = Buffer.from([])
      isLeftDone = index === cntr + chunk.length
    } else {
      // cntr ..... index ..... chunk.length
      left = chunk.subarray(0, index - cntr)
      right = chunk.subarray(index - cntr)
      isLeftDone = true
    }

    cntr = cntr + chunk.length

    return [left, right, isLeftDone]
  }
}

/**
 * A `transform._transform` type function, which lets the input chunks through without any changes
 */
export function transformIdentity(): StreamHandler {
  return function (this: Transform, chunk: Buffer, encoding: NodeJS.BufferEncoding, callback: TransformCallback): void {
    callback(null, chunk)
  }
}

/**
 * A `transform._transform` type function, which for every input chunk will output an empty buffer
 */
export function transformEmpty(): StreamHandler {
  return function (this: Transform, chunk: Buffer, encoding: NodeJS.BufferEncoding, callback: TransformCallback): void {
    callback(null, Buffer.from([]))
  }
}

/**
 * Takes a `transform._transform` type function and turns it into a Transform stream instance
 * @param handler a `transform._transform` type function
 * @returns a Transform stream instance
 */
export function through(handler: StreamHandler): Transform {
  return new Transform({
    transform: handler,
  })
}

/**
 * Higher order function for introducing conditional logic to `transform._transform` functions.
 * This is used internally to handle offsets for `explode()`.
 * @returns a `transform._transform` type function
 */
export function transformSplitBy(
  predicate: TransformPredicate,
  leftHandler: StreamHandler,
  rightHandler: StreamHandler,
): StreamHandler {
  let isFirstChunk = true
  let wasLeftFlushCalled = false
  const damChunkSize = 0x1_00_00
  const dam = new ExpandingBuffer()

  const leftTransform = new QuasiTransform(leftHandler)
  const rightTransform = new QuasiTransform(rightHandler)

  return async function (
    this: Transform,
    chunk: Buffer,
    encoding: NodeJS.BufferEncoding,
    callback: TransformCallback,
  ): Promise<void> {
    const [left, right, isLeftDone] = predicate(chunk)

    const transformedLeft = leftTransform.handle(left, encoding)
    const transformedRight = rightTransform.handle(right, encoding)

    const transformInstance = this

    if (isFirstChunk) {
      isFirstChunk = false
      transformInstance._flush = async function (flushCallback: TransformCallback): Promise<void> {
        if (!dam.isEmpty()) {
          transformInstance.push(dam.read())
        }

        const leftFiller = new Promise<Buffer>((resolve, reject) => {
          if (wasLeftFlushCalled || !isFunction(leftTransform._flush)) {
            resolve(Buffer.from([]))
            return
          }

          leftTransform._flush((error, data) => {
            if (error) {
              reject(error)
            } else {
              resolve(data as Buffer)
            }
          })
        })

        const rightFiller = new Promise<Buffer>((resolve, reject) => {
          if (!isFunction(rightTransform._flush)) {
            resolve(Buffer.from([]))
            return
          }

          rightTransform._flush((err, data) => {
            if (err) {
              reject(err)
            } else {
              resolve(data as Buffer)
            }
          })
        })

        try {
          const buffers = await Promise.all([leftFiller, rightFiller])
          flushCallback(null, Buffer.concat(buffers))
        } catch (error: unknown) {
          flushCallback(error as Error)
        }
      }
    }

    const filler = new Promise<Buffer>((resolve, reject) => {
      if (isLeftDone && !wasLeftFlushCalled && isFunction(leftTransform._flush)) {
        wasLeftFlushCalled = true
        leftTransform._flush((error, data) => {
          if (error) {
            reject(error)
          } else {
            resolve(data as Buffer)
          }
        })
      } else {
        resolve(Buffer.from([]))
      }
    })

    try {
      const buffers = await Promise.all([transformedLeft, filler, transformedRight])

      dam.append(Buffer.concat(buffers))

      if (dam.size() > damChunkSize) {
        const chunks = Math.floor(dam.size() / damChunkSize)
        const data = Buffer.from(dam.read(0, chunks * damChunkSize))
        dam.flushStart(chunks * damChunkSize)
        for (let i = 0; i < chunks - 1; i++) {
          this.push(data.subarray(i * damChunkSize, i * damChunkSize + damChunkSize))
        }

        callback(null, data.subarray((chunks - 1) * damChunkSize))
      } else {
        callback(null, Buffer.from([]))
      }
    } catch (error: unknown) {
      callback(error as Error)
    }
  }
}

/**
 * Data can be piped to the returned function from a stream and it will concatenate all chunks into a single buffer.
 * @param done a callback function, which will receive the concatenated buffer as a parameter
 */
export function toBuffer(done: (buffer: Buffer) => void): Writable {
  const buffer = new ExpandingBuffer()

  return new Writable({
    write(chunk, encoding, callback): void {
      buffer.append(chunk)
      callback()
    },
    final(callback): void {
      done(buffer.getHeap())
      callback()
    },
  })
}
