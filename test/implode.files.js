/* global describe */

const { before } = require('mocha')
const { fileExists } = require('../src/helpers/testing.js')

const TEST_FILE_FOLDER = '../pkware-test-files/'

// only run the tests, if the other repo is present
// https://mochajs.org/#inclusive-tests
before(async function () {
  if (!(await fileExists(TEST_FILE_FOLDER))) {
    this.skip()
  }
})

describe('implode', () => {
  // TODO
})
