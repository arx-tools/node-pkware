# node-pkware

Node JS implementation of StormLib's Pkware compression/decompression algorithm

It was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation / update existing version

`npm i -g node-pkware`

recommended node version: 8.5+

development and testing should be done in node 12.3+ because of the tests utilizing `Readable.from()` - source: https://stackoverflow.com/a/59638132/1806628

tested in node version 14.9.0

## command line interface

`implode <filename> --output=<filename> --ascii|-a|--binary|-b --small|-s|--medium|-m|--large|-l` - compresses file. if `--output` is omitted, then output will be placed next to input and names as `<filename>.compressed`. optionally you can specify an offset from which the compressed data starts with the `--offset=<int|hex>`, which is useful for mixed files, such as the fts files of Arx Fatalis

`explode <filename> --output=<filename>` - decompresses file. if `--output` is omitted, then output will be placed next to input and names as `<filename>.decompressed`. optionally you can specify an offset from which the compressed data starts with the `--offset=<int|hex>`, which is useful for mixed files, such as the fts files of Arx Fatalis

The `--drop-before-offset` flag tells node-pkware to drop the portion before `--offset`, otherwise it will keep it untouched and attach it to the output file.

There is an `--auto-detect` flag, which will search for the first pkware header starting from the beginning of the file. If `--offset` is defined, then it will start searching from that point.

Calling either explode or implode with the `-v` or `--version` flag will display the package's version

## examples

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=1816`

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=0x718`

`implode test/files/fast.fts.unpacked --output=C:/fast.fts --binary --large --offset=1816`

`explode test/files/fast.fts --auto-detect --debug --output=E:/fast.fts.unpacked`

`explode test/files/fast.fts --auto-detect --debug --output=E:/fast.fts.unpacked --offset=2000`

### piping also works

**don't use --debug when piping, because it will be mixed with the decompressed data**

`cat c:/arx/level8.llf | explode > c:/arx/level8.llf.unpacked`

`explode c:/arx/level8.llf > c:/arx/level8.llf.unpacked`

`cat c:/arx/level8.llf | explode --output=c:/arx/level8.llf.unpacked`

`cat e:/piping/level8.llf.unpacked | implode --binary --large > e:/piping/level8.llf`

`implode e:/piping/level8.llf.unpacked --binary --large > e:/piping/level8.llf.comp`

`cat e:/piping/level8.llf.unpacked | implode --binary --large --output="e:/piping/level8.llf"`

## using as a library

### API (named imports of node-pkware)

`explode(config: object): transform._transform` - decompresses stream

Returns a function, that you can use as a [transform.\_transform](https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback) method. The returned function has the `(chunk: Buffer, encoding: string, callback: function)` parameter signature.

Takes an optional config object, which has the following properties:

```
{
  debug: boolean, // whether the code should display debug messages on the console or not (default = false)
  inputBufferSize: int, // the starting size of the input buffer, may expand later as needed. not having to expand may have performance impact (default 0)
  outputBufferSize: int // same as inputBufferSize, but for the outputBuffer (default 0)
}
```

`decompress(config: object): transform._transform` - alias for explode

`implode(compressionType: int, dictionarySize: int, config: object): transform._transform` - compresses stream

Takes an optional config object, which has the following properties:

```
{
  debug: boolean, // whether the code should display debug messages on the console or not (default = false)
  inputBufferSize: int, // the starting size of the input buffer, may expand later as needed. not having to expand may have performance impact (default 0)
  outputBufferSize: int // same as inputBufferSize, but for the outputBuffer (default 0)
}
```

Returns a function, that you can use as a [transform.\_transform](https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback) method. The returned function has the `(chunk: Buffer, encoding: string, callback: function)` parameter signature.

`compress(compressionType: int, dictionarySize: int, config: object): transform._transform` - aliasa for implode

`stream` - an object of helper functions for channeling streams to and from explode/implode

`stream.through(transformer: function): Transform` - a function, which takes a `transform._transform` type function and turns it into a Transform stream instance

`stream.transformEmpty(chunk: Buffer, encoding: string, callback: function)` - a `transform._transform` type function, which for every input chunk will output an empty buffer

`stream.transformIdentity(chunk: Buffer, encoding: string, callback: function)` - a `transform._transform` type function, which lets the input chunks through without any change

`stream.splitAt(index: int): function` - creates a **"predicate"** function, that awaits Buffers, keeps an internal counter of the bytes from them and splits the appropriate buffer at the given index. Splitting is done by returning an array with `[left: Buffer, right: Buffer, isLeftDone: bool]`. If you want to split data at the 100th byte and you keep feeding 60 byte long buffers to the function returned by splitAt(100), then it will return arrays in the following manner:

```
1) [inputBuffer, emptyBuffer, false]
2) [inputBuffer.slice(0, 40), inputBuffer.slice(40, 60), true]
3) [emptyBuffer, inputBuffer, true]
4) [emptyBuffer, inputBuffer, true]
... and so on
```

`stream.transformSplitBy(predicate: predicate, left: transform._transform, right: transform._transform): transform._transform` - higher order function for introducing conditional logic to transform.\_transform functions. This is used internally to handle offsets for explode()

`stream.streamToBuffer(callback: function): writable._write` - data can be piped to the returned function from a stream and it will concatenate all chunks into a single buffer. Takes a callback function, which will receive the concatenated buffer as a parameter

`constants.COMPRESSION_BINARY` and `constants.COMPRESSION_ASCII` - compression types for implode

`constants.DICTIONARY_SIZE_SMALL`, `constants.DICTIONARY_SIZE_MEDIUM` and `constants.DICTIONARY_SIZE_LARGE` - dictionary sizes for implode, determines how well the file get compressed. Small dictionary size means less memory to lookback in data for repetitions, meaning it will be less effective, the file stays larger, less compressed. On the other hand, large compression allows more lookback allowing more effective compression, thus generating smaller, more compressed files.

`errors.InvalidDictionarySizeError` - thrown by implode when invalid dictionary size was specified or by explode when it encounters invalid data in the header section (the first 2 bytes of a compressed files)

`errors.InvalidCompressionTypeError` - thrown by implode when invalid compression type was specified or by explode when it encounters invalid data in the header section (the first 2 bytes of a compressed files)

`errors.InvalidDataError` - thrown by explode, when compressed data is less, than 5 bytes long. pkware compressed files have 2 bytes header followed by at lest 2 bytes of data and an end literal.

`errors.AbortedError` - thrown by explode when compressed data ends without reaching the end literal or in mid decompression

### examples

#### decompressing file with no offset into a file

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through } = stream

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(explode()))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

#### decompressing buffer with no offset into a buffer

```javascript
const { Readable } = require('stream')
const { explode, stream } = require('node-pkware')
const { through, streamToBuffer } = stream

Readable.from(buffer) // buffer is of type Buffer with compressed data
  .pipe(through(explode()))
  .pipe(
    streamToBuffer(decompressedData => {
      // decompressedData holds the decompressed buffer
    })
  )
```

#### decompressing file with offset into a file, keeping initial part intact

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformIdentity } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress the data that comes afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformIdentity(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

#### decompressing file with offset into a file, discarding initial part

```javascript
const fs = require('fs')
const { explode, stream } = require('node-pkware')
const { through, transformSplitBy, splitAt, transformEmpty } = stream

const offset = 150 // 150 bytes of data will be skipped and explode will decompress the data that comes afterwards

fs.createReadStream(`path-to-compressed-file`)
  .pipe(through(transformSplitBy(splitAt(offset), transformEmpty(), explode())))
  .pipe(fs.createWriteStream(`path-to-write-decompressed-data`))
```

## Useful links

### test files

https://github.com/meszaros-lajos-gyorgy/pkware-test-files

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
