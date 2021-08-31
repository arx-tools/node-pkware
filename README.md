# node-pkware

Node JS implementation of StormLib's Pkware compression/decompression algorithm

It was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation / update existing version

`npm i -g node-pkware`

recommended node version: 8.5+

development and testing should be done in node 12.3+ because of the tests utilizing `Readable.from()` - source: https://stackoverflow.com/a/59638132/1806628

tested in node version 14.9.0

## command line interface

_TODO: add documentation_

## using as a library

_TODO: add documentation_

### decompressing file with no offset into a file

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through } = stream

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(explode()))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

### decompressing buffer with no offset into a buffer

```javascript
const { Readable } = require('stream')
const { explode, stream } = require('node-pkware')
const { through } = stream

const streamToBuffer = done => {
  const buffers = []
  return new Writable({
    write(chunk, encoding, callback) {
      buffers.push(chunk)
      callback()
    },
    final(callback) {
      done(Buffer.concat(buffers))
      callback()
    }
  })
}

Readable.from(buffer) // buffer is of type Buffer with compressed data
  .pipe(through(explode()))
  .pipe(
    streamToBuffer(decompressedData => {
      // decompressedData holds the decompressed buffer
    })
  )
```

### decompressing file with offset into a file, keeping initial part intact

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformIdentity } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress data afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformIdentity(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

### decompressing file with offset into a file, discarding initial part

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformEmpty } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress data afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformEmpty(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

---

## misc

### test files

https://github.com/meszaros-lajos-gyorgy/pkware-test-files

### sources:

- https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
- https://github.com/ShieldBattery/implode-decoder
- https://github.com/TheNitesWhoSay/lawine/blob/master/lawine/misc/implode.c - nice find, @alexpineda!
- https://github.com/arx/ArxLibertatis/blob/master/src/io/Blast.cpp
- https://github.com/arx/ArxLibertatis/blob/229d55b1c537c137ac50096221fa486df18ba0d2/src/io/Implode.cpp

Implode was removed from Arx Libertatis at this commit: https://github.com/arx/ArxLibertatis/commit/2db9f0dd023fdd5d4da6f06c08a92d932e218187

### helpful links:

- https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
- https://stackoverflow.com/a/49394095/1806628

### notes:

#### Analogue code on how stream handling should look like with higher order functions

```javascript
const { compose, apply, useWith, concat, splitAt } = require('ramda')

const splitAtIndex = idx => input => {
  return splitAt(idx)(input)
}

const parseString = (splitter, left, right) => input => {
  return compose(apply(useWith(concat, [left, right])), splitter)(input)
}

const headerSize = 6

let handler = toUpper // toUpper will be substituted with explode and implode
if (headerSize > 0) {
  handler = parseString(splitAtIndex(headerSize), identity, handler)
}

const inputData = 'abcdefghijklmnopq'
const outputData = handler(inputData)

console.log(outputData) // 'abcdefGHIJKLMNOPQ'
```

#### Example on how this.\_flush is accessible when defined inside a transform handler

```javascript
const A = () => {
  let firstChunk = true
  return function (chunk, encoding, callback) {
    if (firstChunk) {
      firstChunk = false
      this._flush = x => {
        x(null, 'B')
      }
    }

    callback(null, 'A')
  }
}

class Transform {
  constructor(handler) {
    this.handler = handler
  }

  run() {
    this.handler('XXXX', null, () => {})
  }
}

const handler = A()
const tmp = new Transform(handler)
console.log(handler._flush) // undefined
console.log(tmp._flush) // undefined
tmp.run()
console.log(handler._flush) // undefined
console.log(tmp._flush) // function
```
