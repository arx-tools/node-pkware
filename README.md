# node-pkware

Node JS implementation of StormLib's Pkware compression/decompression algorithm, which is not the same as the zip pkware
format that is commonly used today

It was the de-facto compression for games from around Y2K, like [Arx Fatalis](https://en.wikipedia.org/wiki/Arx_Fatalis)

## installation / update existing version

`npm i -g node-pkware`

- minimum required node version: 18.0.0
- recommended node version (to be able to run the tests): 20.6.0

## command line interface (CLI)

`explode [<filename>] [--offset=<offset>] [--drop-before-offset] [--output=<filename> [--verbose]]` - decompresses a file or a stream

`implode [<filename>] <compression type> <dictionary size> [--offset=<offset>] [--drop-before-offset] [--output=<filename> [--verbose]]` - compresses a file or a stream

`<filename>`, `--output` or both can be omitted when the input is being piped from stdin or when the output is being piped into stdout

The `--offset` can have a numeric value in either decimal or hexadecimal format which tells explode or implode to start decompression at a later point.
This is useful for partially compressed files where the initial header part is uncompressed while the remaining part is compressed.

The `--drop-before-offset` flag tells node-pkware to drop the portion before `--offset`, otherwise it will keep it untouched and attach it to the output file.

The `--verbose` flag will display additional information while running the commands

For implode `<compression type>` can either be `--ascii` or `--binary`

For implode `<dictionary size>` can either be `--small`, `--medium` or `--large`

Calling either explode or implode with only the `-v` or `--version` flag will display the package's version

## examples

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=1816`

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=0x718`

`implode test/files/fast.fts.unpacked --output=C:/fast.fts --binary --large --offset=1816`

### piping also works

`cat c:/arx/level8.llf | explode > c:/arx/level8.llf.unpacked`

`explode c:/arx/level8.llf > c:/arx/level8.llf.unpacked`

`cat c:/arx/level8.llf | explode --output=c:/arx/level8.llf.unpacked`

`cat e:/piping/level8.llf.unpacked | implode --binary --large > e:/piping/level8.llf`

`implode e:/piping/level8.llf.unpacked --binary --large > e:/piping/level8.llf.comp`

`cat e:/piping/level8.llf.unpacked | implode --binary --large --output="e:/piping/level8.llf"`

## using as a library

### API (named imports of node-pkware)

`explode(config: object): transform._transform` - decompresses stream

`decompress(config: object): transform._transform` - alias for explode

Returns a function, that you can use as a [transform.\_transform](https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback) method.
The returned function has the `(chunk: Buffer, encoding: string, callback: function)` parameter signature.

Takes an optional config object, which has the following properties:

```js
{
  verbose: boolean // whether the code should display extra debug messages on the console or not (default = false)
}
```

`implode(compressionType: int, dictionarySize: int, config: object): transform._transform` - compresses stream

`compress(compressionType: int, dictionarySize: int, config: object): transform._transform` - alias for implode

Takes an optional config object, which has the following properties:

```js
{
  verbose: boolean // whether the code should display extra debug messages on the console or not (default = false)
}
```

Returns a function, that you can use as a [transform.\_transform](https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback) method.
The returned function has the `(chunk: Buffer, encoding: string, callback: function)` parameter signature.

`stream` - an object of helper functions for channeling streams to and from explode/implode

`stream.through(transformer: function): Transform` - a function, which takes a `transform._transform` type function and turns it into a Transform stream instance

`stream.transformEmpty(chunk: Buffer, encoding: string, callback: function)` - a `transform._transform` type function, which for every input chunk will output an empty buffer

`stream.transformIdentity(chunk: Buffer, encoding: string, callback: function)` - a `transform._transform` type function, which lets the input chunks through without any change

`stream.splitAt(index: int): function` - creates a **"predicate"** function, that awaits Buffers, keeps an internal counter of the bytes from them and splits the appropriate buffer at the given index. Splitting is done by returning an array with `[left: Buffer, right: Buffer, isLeftDone: bool]`. If you want to split data at the 100th byte and you keep feeding 60 byte long buffers to the function returned by splitAt(100), then it will return arrays in the following manner:

```
1) [inputBuffer, emptyBuffer, false]
2) [inputBuffer.subarray(0, 40), inputBuffer.subarray(40, 60), true]
3) [emptyBuffer, inputBuffer, true]
4) [emptyBuffer, inputBuffer, true]
... and so on
```

`stream.transformSplitBy(predicate: predicate, left: transform._transform, right: transform._transform): transform._transform` - higher order function for introducing conditional logic to transform.\_transform functions. This is used internally to handle offsets for explode()

`stream.toBuffer(callback: function): writable._write` - data can be piped to the returned function from a stream and it will concatenate all chunks into a single buffer. Takes a callback function, which will receive the concatenated buffer as a parameter

`constants.Compression.Binary` and `constants.Compression.Ascii` - compression types for implode

`constants.DictionarySize.Small`, `constants.DictionarySize.Medium` and `constants.DictionarySize.Large` - dictionary sizes for implode, determines how well the file get compressed. Small dictionary size means less memory to lookback in data for repetitions, meaning it will be less effective, the file stays larger, less compressed. On the other hand, large compression allows more lookback allowing more effective compression, thus generating smaller, more compressed files. The original C library used less memory when the dictionary size was smaller, plus there might be files out there which only support smaller dictionary sizes

`errors.InvalidDictionarySizeError` - thrown by implode when invalid dictionary size was specified or by explode when it encounters invalid data in the header section (the first 2 bytes of a compressed files)

`errors.InvalidCompressionTypeError` - thrown by implode when invalid compression type was specified or by explode when it encounters invalid data in the header section (the first 2 bytes of a compressed files)

`errors.AbortedError` - thrown by explode when compressed data ends without reaching the end literal or in mid decompression

### examples

#### decompressing file with no offset into a file

```js
const fs = require('node:fs')
const { explode, stream } = require('node-pkware')
const { through } = stream

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(explode()))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

#### decompressing buffer with no offset into a buffer

```js
const { Readable } = require('node:stream')
const { explode, stream } = require('node-pkware')
const { through, toBuffer } = stream

Readable.from(buffer) // buffer is of type Buffer with compressed data
  .pipe(through(explode()))
  .pipe(
    toBuffer((decompressedData) => {
      // decompressedData holds the decompressed buffer
    }),
  )
```

#### decompressing file with offset into a file, keeping initial part intact

```js
const fs = require('node:fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformIdentity } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress the data that comes afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformIdentity(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

#### decompressing file with offset into a file, discarding initial part

```js
const fs = require('node:fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformEmpty } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress the data that comes afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformEmpty(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

#### Non-stream compression (also works in browser)

```js
import * as fs from 'node:fs/promises'
import { implode } from 'node-pkware/simple'

const inputString = 'hello pkware!'

// create an ArrayBuffer from inputString
const encoder = new TextEncoder()
const input = encoder.encode(inputString).buffer

// compress it and get the result in another ArrayBuffer
const output = implode(input, 'ascii', 'large')

// write the output to a file
await fs.writeFile('/tmp/compressedHello', new Uint8Array(output))
```

### Catching errors

```js
const fs = require('node:fs')
const { explode, stream } = require('node-pkware')
const { through } = stream

fs.createReadStream(`path-to-compressed-file`)
  .on('error', (err) => {
    console.error('readstream error')
  })
  .pipe(
    through(explode()).on('error', (err) => {
      console.error('explode error')
    }),
  )
  .pipe(
    fs.createWriteStream(`path-to-write-decompressed-data`).on('error', (err) => {
      console.error('writestream error')
    }),
  )
```

## Useful links

### test files

https://github.com/arx-tools/pkware-test-files

### sources

- https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
- https://github.com/ShieldBattery/implode-decoder
- https://github.com/TheNitesWhoSay/lawine/blob/master/lawine/misc/implode.c - nice find, @alexpineda!
- https://github.com/arx/ArxLibertatis/blob/master/src/io/Blast.cpp
- https://github.com/arx/ArxLibertatis/blob/229d55b1c537c137ac50096221fa486df18ba0d2/src/io/Implode.cpp

Implode was removed from Arx Libertatis at this commit: https://github.com/arx/ArxLibertatis/commit/2db9f0dd023fdd5d4da6f06c08a92d932e218187

### helpful info

- https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
- https://stackoverflow.com/a/49394095/1806628
- https://nodejs.org/api/stream.html
