/* global describe, it */

const assert = require('assert')
const { isFunction } = require('ramda-adjunct')
const {
  isBetween,
  nBitsOfOnes,
  maskBits,
  isFullHexString,
  toHex,
  dumpBytes,
  isNumeric
} = require('../../src/helpers/src.js')

describe('helpers/src', () => {
  describe('isBetween', () => {
    it('is a function', () => {
      assert.ok(isFunction(isBetween), `${isBetween} is not a function`)
    })
    it('takes 3 numbers and returns true when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 4), true)
      assert.strictEqual(isBetween(-5, 0, -1), true)
    })
    it('takes 3 numbers and returns false when the 3rd number is between the first 2', () => {
      assert.strictEqual(isBetween(3, 7, 94), false)
    })
    it('returns null, when any of the parameters are not numbers', () => {
      assert.strictEqual(isBetween('3', 12, 7), null)
      assert.strictEqual(isBetween(3, { foo: 12 }, 7), null)
      assert.strictEqual(isBetween(-1, 1, false), null)
    })
    it("sorts first 2 parameters, so that parameter order doesn't matter", () => {
      assert.strictEqual(isBetween(12, 1, 4), true)
    })
    it('returns false, when first 2 parameters are equal, but the 3rd differs', () => {
      assert.strictEqual(isBetween(7, 7, 7), true)
      assert.strictEqual(isBetween(7, 7, 9), false)
    })
  })

  describe('nBitsOfOnes', () => {
    it('is a function', () => {
      assert.ok(isFunction(nBitsOfOnes), `${nBitsOfOnes} is not a function`)
    })
    it('takes a number and returns a number with the amount of lowest 1 bits based on the value of the given parameter', () => {
      assert.strictEqual(nBitsOfOnes(10), 0b1111111111)
      assert.strictEqual(nBitsOfOnes(4), 0b1111)
      assert.strictEqual(nBitsOfOnes(0), 0)
    })
    it('returns null, when given parameter is not a number', () => {
      assert.strictEqual(nBitsOfOnes(false), null)
      assert.strictEqual(nBitsOfOnes('12'), null)
    })
    it('returns null, when given number is negative', () => {
      assert.strictEqual(nBitsOfOnes(-3), null)
    })
    it('returns null, when given parameter is not an integer', () => {
      assert.strictEqual(nBitsOfOnes(3.1415), null)
    })
  })

  describe('maskBits', () => {
    it('is a function', () => {
      assert.ok(isFunction(maskBits), `${maskBits} is not a function`)
    })
    it('returns null, when given parameters are not a numbers', () => {
      assert.strictEqual(maskBits(false, 5), null)
      assert.strictEqual(maskBits('12', null), null)
      assert.strictEqual(maskBits(3, true), null)
    })
    it('returns null, when given parameters are negative', () => {
      assert.strictEqual(maskBits(-3, 31), null)
      assert.strictEqual(maskBits(3, -31), null)
    })
    it('returns null, when given parameters are not integers', () => {
      assert.strictEqual(maskBits(0.7, 31), null)
      assert.strictEqual(maskBits(3, 31.2), null)
    })
    it('returns 3 when first parameter is 2 and the second parameter is 167', () => {
      assert.strictEqual(maskBits(2, 167), 3)
    })
  })

  describe('isFullHexString', () => {
    it('is a function', () => {
      assert.ok(isFunction(isFullHexString), `${isFullHexString} is not a function`)
    })
    it('returns true, when given parameter starts with 0x followed by at least one hexadecimal number', () => {
      assert.strictEqual(isFullHexString('0x1f2'), true)
    })
    it('returns true, when given parameter has whitespace around it', () => {
      assert.strictEqual(isFullHexString('   0x12'), true)
    })
    it('returns false, when given parameter is not a string or does not match the 0x<hex chars> formula', () => {
      assert.strictEqual(isFullHexString('lorem ipsum'), false)
      assert.strictEqual(isFullHexString(false), false)
      assert.strictEqual(isFullHexString(['0x10']), false)
      assert.strictEqual(isFullHexString(100), false)
    })
    it('returns false, when given parameter contains anything else apart from whitespace and hex string', () => {
      assert.strictEqual(isFullHexString(' 0x10 0x20'), false)
      assert.strictEqual(isFullHexString('lorem ipsum'), false)
    })
  })

  describe('toHex', () => {
    it('is a function', () => {
      assert.ok(isFunction(toHex), `${toHex} is not a function`)
    })
    it('returns a string of hexadecimal representation of the given number, prefixed with 0x', () => {
      assert.strictEqual(toHex(57), '0x39')
      assert.strictEqual(toHex(101), '0x65')
    })
    it('returns null, when first parameter is not a number', () => {
      assert.strictEqual(toHex(false), null)
    })
    it('returns null, when first parameter is not an integer', () => {
      assert.strictEqual(toHex(54.31214), null)
    })
    it('returns itself, when given parameter is a valid hex string', () => {
      assert.strictEqual(toHex('0x35'), '0x35')
    })
    it('returns null, when given parameter is a string, but not a valid hex string', () => {
      assert.strictEqual(toHex('foo bar'), null)
    })
    it('trims off whitespace from around given hex string', () => {
      assert.strictEqual(toHex('   0x14952 '), '0x14952')
    })
    it("pads the portion after 0x with zeros, when second parameter is bigger, than the hex numbers' length", () => {
      assert.strictEqual(toHex(100, 5), '0x00064')
      assert.strictEqual(toHex(200, 9), '0x0000000c8')
    })
    it('also pads given parameter with zeros, if it is already a hex string', () => {
      assert.strictEqual(toHex('0x45', 4), '0x0045')
    })
    it('removes padding zeros from a given hex string, when second parameter is less, than the number of digits', () => {
      assert.strictEqual(toHex('0x00012', 3), '0x012')
    })
    it('returns null, when second parameter is not a positive integer', () => {
      assert.strictEqual(toHex(123, -4), null)
      assert.strictEqual(toHex(154, 'hello'), null)
      assert.strictEqual(toHex(92, false), null)
    })
    it('returns only the hex characters without 0x prefix, when 3rd parameter is true', () => {
      assert.strictEqual(toHex(200, 0, true), 'c8')
      assert.strictEqual(toHex(600, 5, true), '00258')
    })
  })

  describe('dumpBytes', () => {
    it('is a function', () => {
      assert.ok(isFunction(dumpBytes), `${dumpBytes} is not a function`)
    })
  })

  describe('isNumeric', () => {
    it('is a function', () => {
      assert.ok(isFunction(isNumeric), `${isNumeric} is not a function`)
    })
  })
})
