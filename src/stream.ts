import { Transform, Writable, TransformCallback } from 'node:stream'
import { promisify } from 'node:util'
import { isFunction } from './functions.js'
import { ExpandingBuffer } from './ExpandingBuffer.js'
import { EMPTY_BUFFER } from './constants.js'

class QuasiTransform {
  #handler: (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void
  _flush?: (callback: TransformCallback) => void

  constructor(
    handler: (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void,
  ) {
    this.#handler = handler
  }

  handle(chunk: Buffer, encoding: BufferEncoding): Promise<Buffer> {
    return promisify(this.#handler).call(this, chunk, encoding)
  }
}

/**
 * Creates a "**predicate**" function, that awaits Buffers, keeps an internal counter of the bytes from them and splits the appropriate buffer at the given index.
 * Splitting is done by returning an array with `[left: Buffer, right: Buffer, isLeftDone: bool]`.
 * If you want to split data at the 100th byte and you keep feeding 60 byte long buffers to the function returned by `splitAt(100)`, then it will return arrays in the following manner:
 * 1. `[inputBuffer, emptyBuffer, false]`
 * 2. `[inputBuffer.slice(0, 40), inputBuffer.slice(40, 60), true]`
 * 3. `[emptyBuffer, inputBuffer, true]`
 * 4. `[emptyBuffer, inputBuffer, true]`
 * 5. ... and so on
 * @param index - a positive integer at which to split the buffer
 */
export const splitAt = (index: number) => {
  let cntr = 0

  return (chunk: Buffer) => {
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

    cntr += chunk.length

    return [left, right, isLeftDone] as [Buffer, Buffer, boolean]
  }
}

/**
 * A `transform._transform` type function, which lets the input chunks through without any changes
 */
export const transformIdentity = () => {
  return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    callback(null, chunk)
  }
}

/**
 * A `transform._transform` type function, which for every input chunk will output an empty buffer
 */
export const transformEmpty = () => {
  return function (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    callback(null, EMPTY_BUFFER)
  }
}

/**
 * Takes a `transform._transform` type function and turns it into a Transform stream instance
 * @param handler a `transform._transform` type function
 * @returns a Transform stream instance
 */
export const through = (
  handler: (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void,
) => {
  return new Transform({
    transform: handler,
  })
}

/**
 * Higher order function for introducing conditional logic to `transform._transform` functions.
 * This is used internally to handle offsets for `explode()`.
 * @returns a `transform._transform` type function
 */
export const transformSplitBy = (
  predicate: (chunk: Buffer) => [Buffer, Buffer, boolean],
  leftHandler: (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void,
  rightHandler: (this: Transform, chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => void,
) => {
  let isFirstChunk = true
  let wasLeftFlushCalled = false
  const damChunkSize = 0x10000
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

          leftTransform._flush((err, data) => {
            if (err) {
              reject(err)
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
          .catch((err) => {
            flushCallback(err)
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
      .catch((err) => {
        callback(err)
      })
  }
}

/**
 * Data can be piped to the returned function from a stream and it will concatenate all chunks into a single buffer.
 * @param done a callback function, which will receive the concatenated buffer as a parameter
 */
export const toBuffer = (done: (buffer: Buffer) => void) => {
  const buffer = new ExpandingBuffer()
  return new Writable({
    write(chunk, encoding, callback) {
      buffer.append(chunk)
      callback()
    },
    final(callback) {
      done(buffer.getHeap())
      callback()
    },
  })
}
