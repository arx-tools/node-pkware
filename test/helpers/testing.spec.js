/* global describe, it */

const assert = require('assert')
const { Writable, Readable } = require('stream')
const { isFunction } = require('ramda-adjunct')
const {
  isClass,
  bufferToString,
  buffersShouldEqual,
  streamToBuffer,
  transformToABC
} = require('../../src/helpers/testing.js')

describe('helpers/testing', () => {
  describe('isClass', () => {
    it('is a function', () => {
      assert.ok(isFunction(isClass), `${isClass} is not a function`)
    })
    // TODO: add tests
  })

  describe('bufferToString', () => {
    it('is a function', () => {
      assert.ok(isFunction(bufferToString), `${bufferToString} is not a function`)
    })
    // TODO: add tests
  })

  describe('buffersShouldEqual', () => {
    it('is a function', () => {
      assert.ok(isFunction(buffersShouldEqual), `${buffersShouldEqual} is not a function`)
    })
    it('does not throw an error, when the contents of 2 buffers match', () => {
      const buffer1 = Buffer.from([1, 2, 3, 4])
      const buffer2 = Buffer.concat([Buffer.from([1, 2]), Buffer.from([3, 4])])
      assert.doesNotThrow(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the contents of 2 buffers differ', () => {
      const buffer1 = Buffer.from([1, 2, 3, 4])
      const buffer2 = Buffer.from([1, 2, 3])
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the 1st given parameter is not a Buffer', () => {
      const buffer1 = {
        equals: () => {
          console.log('bamboozled!')
          return true
        }
      }
      const buffer2 = Buffer.from([1, 2, 3])
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
    it('throws an error, when the 2nd given parameter is not a Buffer', () => {
      const buffer1 = Buffer.from([65, 66, 67])
      const buffer2 = 'abc'
      assert.throws(() => {
        buffersShouldEqual(buffer1, buffer2)
      })
    })
  })

  describe('streamToBuffer', () => {
    it('is a function', () => {
      assert.ok(isFunction(streamToBuffer), `${streamToBuffer} is not a function`)
    })
    it('returns a writable stream when calling it as a function', () => {
      const handler = streamToBuffer()
      assert.ok(handler instanceof Writable)
    })
    it('takes a callback function, which is called, when writable gets no more data', done => {
      const handler = streamToBuffer(() => {
        done()
      })
      Readable.from('lorem ipsum dolor').pipe(handler)
    })
    it('only calls the callback function once all the input have been gathered', done => {
      let isCalled = false
      const handler = streamToBuffer(data => {
        isCalled = true
      })
      const stream = new Readable({
        read() {
          return null
        }
      })
      stream.pipe(handler)
      setTimeout(() => {
        assert.strictEqual(isCalled, false)
        done()
      }, 100)
    })
    it('calls the callback with the data accumulated via piping once the stream is finished', done => {
      const handler = streamToBuffer(data => {
        buffersShouldEqual(data, Buffer.from('lorem ipsum dolor sit amet'))
        done()
      })
      const stream = new Readable({
        read() {
          return null
        }
      })
      stream.pipe(handler)
      stream.push('lorem ')
      stream.push('ipsum ')
      stream.push('dolor ')
      stream.push('sit ')
      stream.push('amet')
      stream.push(null)
    })
  })

  describe('transformToABC', () => {
    it('is a function', () => {
      assert.ok(isFunction(transformToABC), `${transformToABC} is not a function`)
    })
    it('takes no argument and returns a function', () => {
      const handler = transformToABC()
      assert.strictEqual(isFunction(handler), true)
    })
    describe('returned handler', () => {
      it('it always outputs a single character to the callback parameter', done => {
        const handler = transformToABC()
        const callback = (error, data) => {
          assert.strictEqual(error, null, '1st parameter (error) in the callback should be null')
          buffersShouldEqual(data, Buffer.from('A'))
          done()
        }
        handler(Buffer.from([1, 2, 3, 4, 5]), null, callback)
      })
      it('always gives a different single character from the alphabet at every call', done => {
        const handler = transformToABC()
        const responses = []
        const callback = (_error, data) => {
          responses.push(data)

          if (responses.length === 4) {
            buffersShouldEqual(responses[0], Buffer.from('A'))
            buffersShouldEqual(responses[1], Buffer.from('B'))
            buffersShouldEqual(responses[2], Buffer.from('C'))
            buffersShouldEqual(responses[3], Buffer.from('D'))
            done()
          }
        }

        handler(Buffer.from([1, 1, 1]), null, callback)
        handler(Buffer.from([2]), null, callback)
        handler(Buffer.from([]), null, callback)
        handler(Buffer.from('44444'), null, callback)
      })
    })
  })
})
