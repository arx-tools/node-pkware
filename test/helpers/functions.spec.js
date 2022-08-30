const assert = require('assert')
const { describe, it } = require('mocha')
const {
  isNumber,
  isFunction,
  isBetween,
  nBitsOfOnes,
  maskBits,
  isFullHexString,
  toHex,
  getLowestNBits,
  mergeSparseArrays,
} = require('../../src/helpers/functions.js')

describe('helpers/functions', () => {
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

  describe('getLowestNBits', () => {
    it('is a function', () => {
      assert.ok(isFunction(getLowestNBits), `${getLowestNBits} is not a function`)
    })
    it('returns a number', () => {
      const result = getLowestNBits(3, 0b0111010)
      assert.ok(isNumber(result), `${result} is not a number`)
    })
    it('returns the lowest 3 bits of the number given as the 2nd parameter, when the first parameter is 3', () => {
      assert.strictEqual(getLowestNBits(3, 0b10001010111101110111010), 2)
      assert.strictEqual(getLowestNBits(3, 0b1010101000111), 7)
    })
    it('returns the lowest 6 bits of a number, when first parameter is 6', () => {
      assert.strictEqual(getLowestNBits(6, 0b100101011001100), 0b001100)
    })
  })

  describe('mergeSparseArrays', () => {
    it('is a function', () => {
      assert.ok(isFunction(mergeSparseArrays), `${mergeSparseArrays} is not a function`)
    })
    it('accepts two arrays and returns an array', () => {
      const result = mergeSparseArrays([], [])
      assert.ok(Array.isArray(result), `${result} is not an array`)
    })
    it('returns an empty array, when receives other, than 2 arrays', () => {
      assert.deepStrictEqual(mergeSparseArrays(null, 7), [])
    })
    it('returns [1, undefined, 3], when inputs are [1,,] and [,,3]', () => {
      assert.deepStrictEqual(mergeSparseArrays([1, ,], [, , 3]), [1, undefined, 3])
    })
    it('uses values from the left array, when both arrays have non-undefined values at the same index', () => {
      assert.deepStrictEqual(mergeSparseArrays([1, ,], [4, 5, 6]), [1, 5, 6])
    })
    it('does not truncate arrays ending or starting on undefined', () => {
      const a = [1, undefined, undefined]
      const b = [undefined, undefined, undefined]
      const result = mergeSparseArrays(a, b)
      const expected = [1, undefined, undefined]
      assert.deepStrictEqual(result, expected)
    })
    it('will use values from both arrays, when first array is longer', () => {
      const a1 = [1, undefined, 2, undefined]
      const b1 = [undefined, undefined, 3]
      const result1 = mergeSparseArrays(a1, b1)
      const expected1 = [1, undefined, 2, undefined]
      assert.deepStrictEqual(result1, expected1)
    })
    it('will use values from both arrays, when first array is shorter', () => {
      const a2 = [1, undefined]
      const b2 = [undefined, undefined, 3]
      const result2 = mergeSparseArrays(a2, b2)
      const expected2 = [1, undefined, 3]
      assert.deepStrictEqual(result2, expected2)
    })
    it('returns the 2nd array, when the 1st is empty', () => {
      const data = [1, 2, 3, undefined, 5]
      assert.deepStrictEqual(mergeSparseArrays([], data), data)
    })
    it('returns the 1st array, when the 2nd is empty', () => {
      const data = [1, 2, 3, undefined, 5]
      assert.deepStrictEqual(mergeSparseArrays(data, []), data)
    })
  })
})
