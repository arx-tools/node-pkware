import { Transform, Writable, type TransformCallback } from 'node:stream'
import { promisify } from 'node:util'
import { isFunction } from '@src/functions.js'
import { ExpandingBuffer } from '@src/ExpandingBuffer.js'
import { EMPTY_BUFFER } from '@src/constants.js'

export type StreamHandler = (
  this: Transform,
  chunk: Buffer,
  encoding: BufferEncoding,
  callback: TransformCallback,
) => void | Promise<void>

type TransformPredicate = (chunk: Buffer) => [Buffer, Buffer, boolean]

class QuasiTransform {
  _flush?: (callback: TransformCallback) => void

  readonly #handler: StreamHandler

  constructor(handler: StreamHandler) {
    this.#handler = handler
  }

  async handle(chunk: Buffer, encoding: BufferEncoding): Promise<Buffer> {
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

  return (chunk: Buffer): [Buffer, Buffer, boolean] => {
    let left: Buffer
    let right: Buffer
    let isLeftDone: boolean

    if (index <= cntr) {
      // index ..... cntr ..... chunk.length
      left = EMPTY_BUFFER
      right = chunk
      isLeftDone = true
    } else if (index >= cntr + chunk.length) {
      // cntr ..... chunk.length ..... index
      left = chunk
      right = EMPTY_BUFFER
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
  return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    callback(null, chunk)
  }
}

/**
 * A `transform._transform` type function, which for every input chunk will output an empty buffer
 */
export function transformEmpty(): StreamHandler {
  return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    callback(null, EMPTY_BUFFER)
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
) {
  let isFirstChunk = true
  let wasLeftFlushCalled = false
  const damChunkSize = 0x1_00_00
  const dam = new ExpandingBuffer()

  const leftTransform = new QuasiTransform(leftHandler)
  const rightTransform = new QuasiTransform(rightHandler)

  return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    const [left, right, isLeftDone] = predicate(chunk)

    const _left = leftTransform.handle(left, encoding)
    const _right = rightTransform.handle(right, encoding)

    if (isFirstChunk) {
      isFirstChunk = false
      this._flush = (flushCallback) => {
        if (!dam.isEmpty()) {
          this.push(dam.read())
        }

        const leftFiller = new Promise((resolve, reject) => {
          if (wasLeftFlushCalled || !isFunction(leftTransform._flush)) {
            resolve(EMPTY_BUFFER)
            return
          }

          leftTransform._flush((error, data) => {
            if (error) {
              reject(error)
            } else {
              resolve(data)
            }
          })
        })

        const rightFiller = new Promise((resolve, reject) => {
          if (!isFunction(rightTransform._flush)) {
            resolve(EMPTY_BUFFER)
            return
          }

          rightTransform._flush((err, data) => {
            if (err) {
              reject(err)
            } else {
              resolve(data)
            }
          })
        })

        Promise.all([leftFiller, rightFiller])
          .then((buffers) => {
            // TODO: TransformCallback assumes the returned data is any instead of Buffer
            flushCallback(null, Buffer.concat(buffers as Buffer[]))
          })
          .catch((error: unknown) => {
            flushCallback(error as Error)
          })
      }
    }

    const filler = new Promise((resolve, reject) => {
      if (isLeftDone && !wasLeftFlushCalled && isFunction(leftTransform._flush)) {
        wasLeftFlushCalled = true
        leftTransform._flush((err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      } else {
        resolve(EMPTY_BUFFER)
      }
    })

    Promise.all([_left, filler, _right])
      .then((buffers) => {
        // TODO: TransformCallback assumes the returned data is any instead of Buffer
        dam.append(Buffer.concat(buffers as Buffer[]))
        if (dam.size() > damChunkSize) {
          const chunks = Math.floor(dam.size() / damChunkSize)
          const data = Buffer.from(dam.read(0, chunks * damChunkSize))
          dam.flushStart(chunks * damChunkSize)
          for (let i = 0; i < chunks - 1; i++) {
            this.push(data.subarray(i * damChunkSize, i * damChunkSize + damChunkSize))
          }

          callback(null, data.subarray((chunks - 1) * damChunkSize))
        } else {
          callback(null, EMPTY_BUFFER)
        }
      })
      .catch((error: unknown) => {
        callback(error as Error)
      })
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
