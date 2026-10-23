import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { Readable, Writable, type Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, it } from 'node:test'
import {
  splitAt,
  toBuffer,
  transformEmpty,
  transformIdentity,
  transformSplitBy,
  through,
  type StreamHandler,
} from '../../src/stream/stream.ts'
import { transformToABC } from '../helpers.ts'

/**
 * Runs the given chunks through a stream handler.
 *
 * @param handler The transform handler to run.
 * @param chunks The input chunks.
 * @returns The concatenated output of the stream.
 */
async function runChunks(handler: StreamHandler, chunks: string[]): Promise<Buffer> {
  const output: Buffer[] = []
  const sink = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      output.push(chunk)
      callback()
    },
  })

  await pipeline(
    Readable.from(
      chunks.map((chunk) => {
        return Buffer.from(chunk)
      }),
    ),
    through(handler),
    sink,
  )

  return Buffer.concat(output)
}

/**
 * Runs the given bytes into a `toBuffer` sink.
 *
 * @param input The bytes to collect.
 * @returns The buffer the sink received.
 */
async function collectWithToBuffer(input: Buffer): Promise<Buffer> {
  let result: Buffer = Buffer.alloc(0)

  await pipeline(
    Readable.from([input]),
    toBuffer((buffer) => {
      result = buffer
    }),
  )

  return result
}

type FlushState = {
  wasFlushCalled: boolean
}

type LetterState = {
  letter: number
}

/**
 * A handler which passes the chunks through, but registers a flush callback on the stream.
 *
 * @param state The object which records whether the flush was called.
 * @returns A transform handler.
 */
function createFlushTrackingHandler(state: FlushState): StreamHandler {
  return function (this: Transform, chunk, encoding, callback): void {
    this._flush = (flushCallback): void => {
      state.wasFlushCalled = true
      flushCallback(null, Buffer.from([]))
    }

    callback(null, chunk)
  }
}

/**
 * A handler which replaces the flush of the handler it is given with a single letter.
 *
 * @param state The object which holds the next letter to output.
 * @returns A transform handler.
 */
function createFillerHandler(state: LetterState): StreamHandler {
  let isFirstChunk = true

  return function (this: Transform, chunk, encoding, callback): void {
    if (isFirstChunk) {
      isFirstChunk = false
      this._flush = (flushCallback): void => {
        flushCallback(null, Buffer.from([state.letter]))
        state.letter = state.letter + 1
      }
    }

    callback(null, chunk)
  }
}

void describe('stream/stream', () => {
  void describe('splitAt', () => {
    void it('returns the whole buffer as the right part when the index is 0', () => {
      const [left, right, isLeftDone] = splitAt(0)(Buffer.from([1, 2, 3]))

      assert.ok(left.equals(Buffer.from([])), 'the left part should be empty')
      assert.ok(right.equals(Buffer.from([1, 2, 3])), 'the right part should be the whole buffer')
      assert.equal(isLeftDone, true)
    })

    void it('splits the buffer when the index is inside it', () => {
      const [left, right, isLeftDone] = splitAt(2)(Buffer.from([1, 2, 3, 4, 5]))

      assert.ok(left.equals(Buffer.from([1, 2])), 'the left part should be the first two bytes')
      assert.ok(right.equals(Buffer.from([3, 4, 5])), 'the right part should be the rest')
      assert.equal(isLeftDone, true)
    })

    void it('puts the whole buffer to the left when the index matches its length', () => {
      const [left, right, isLeftDone] = splitAt(3)(Buffer.from([1, 2, 3]))

      assert.ok(left.equals(Buffer.from([1, 2, 3])), 'the left part should be the whole buffer')
      assert.ok(right.equals(Buffer.from([])), 'the right part should be empty')
      assert.equal(isLeftDone, true)
    })

    void it('keeps the buffers on the left while the index is beyond them', () => {
      const handler = splitAt(8)
      const [left1, right1, isLeftDone1] = handler(Buffer.from([1, 2, 3, 4, 5]))
      const [left2, right2, isLeftDone2] = handler(Buffer.from([6, 7, 8, 9, 10]))

      assert.ok(left1.equals(Buffer.from([1, 2, 3, 4, 5])), 'the first chunk should stay on the left')
      assert.ok(right1.equals(Buffer.from([])), 'the first chunk should not be split')
      assert.equal(isLeftDone1, false)
      assert.ok(left2.equals(Buffer.from([6, 7, 8])), 'the second chunk should be split at the index')
      assert.ok(right2.equals(Buffer.from([9, 10])), 'the rest of the second chunk goes to the right')
      assert.equal(isLeftDone2, true)
    })

    void it('splits only once, the rest of the chunks go to the right', () => {
      const handler = splitAt(4)
      const [left1, right1, isLeftDone1] = handler(Buffer.from([1, 2, 3, 4, 5]))
      const [left2, right2, isLeftDone2] = handler(Buffer.from([6, 7, 8, 9, 10]))

      assert.ok(left1.equals(Buffer.from([1, 2, 3, 4])), 'the left part should end at the index')
      assert.ok(right1.equals(Buffer.from([5])), 'the rest of the first chunk goes to the right')
      assert.equal(isLeftDone1, true)
      assert.ok(left2.equals(Buffer.from([])), 'nothing should go to the left anymore')
      assert.ok(right2.equals(Buffer.from([6, 7, 8, 9, 10])), 'the whole second chunk goes to the right')
      assert.equal(isLeftDone2, true)
    })
  })

  void describe('transformIdentity', () => {
    void it('lets the input through without changes', async () => {
      const output = await runChunks(transformIdentity(), ['this is a test'])

      assert.ok(output.equals(Buffer.from('this is a test')), 'the chunks should not change')
    })
  })

  void describe('transformEmpty', () => {
    void it('returns an empty buffer for every chunk', async () => {
      const output = await runChunks(transformEmpty(), ['this is a test'])

      assert.ok(output.equals(Buffer.from([])), 'every chunk should be dropped')
    })
  })

  void describe('through', () => {
    void it('calls _flush when the input stream has finished', async () => {
      const state = { wasFlushCalled: false }

      const output = await runChunks(createFlushTrackingHandler(state), ['abcdef', 'ghijkl'])

      assert.ok(output.equals(Buffer.from('abcdefghijkl')), 'the chunks should pass through')
      assert.equal(state.wasFlushCalled, true, 'the flush should be called at the end')
    })
  })

  void describe('transformSplitBy', () => {
    void it('only lets the first part through with an identity and an empty handler', async () => {
      const output = await runChunks(transformSplitBy(splitAt(3), transformIdentity(), transformEmpty()), ['abcde'])

      assert.ok(output.equals(Buffer.from('abc')), 'only the part before the split point should stay')
    })

    void it('only lets the second part through with an empty and an identity handler', async () => {
      const output = await runChunks(transformSplitBy(splitAt(3), transformEmpty(), transformIdentity()), ['abcde'])

      assert.ok(output.equals(Buffer.from('de')), 'only the part after the split point should stay')
    })

    void it('splits the data only once', async () => {
      const output = await runChunks(transformSplitBy(splitAt(10), transformEmpty(), transformToABC()), [
        'abcdef',
        'ghijkl',
        'mnopqr',
        'stuvwx',
      ])

      assert.ok(output.equals(Buffer.from('ABCD')), 'every chunk after the split point should be a letter')
    })

    void it('calls the flush of both handlers at the split point and at the end', async () => {
      const state = { letter: 65 }

      const output = await runChunks(
        transformSplitBy(splitAt(10), createFillerHandler(state), createFillerHandler(state)),
        ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx'],
      )

      assert.ok(output.equals(Buffer.from('abcdefghijAklmnopqrstuvwxB')), 'both fillers should be appended once')
    })
  })

  void describe('toBuffer', () => {
    void it('returns a writable stream', () => {
      function noop(): void {
        // the returned stream is what matters here, the callback is not called
      }

      assert.ok(toBuffer(noop) instanceof Writable)
    })

    void it('gathers the written bytes into one buffer, without the unused capacity of the heap', async () => {
      const input = Buffer.from('lorem ipsum dolor')
      const output = await collectWithToBuffer(input)

      assert.ok(output.equals(input), 'the gathered buffer should contain exactly the written bytes')
    })

    void it('calls the callback only once', async () => {
      let calls = 0

      await pipeline(
        Readable.from([Buffer.from('abc')]),
        toBuffer(() => {
          calls = calls + 1
        }),
      )

      assert.equal(calls, 1)
    })
  })
})
