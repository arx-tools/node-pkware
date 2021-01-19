# node-pkware

Node JS implementation of StormLib's Pkware compression/decompression algorithm

It was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation / update existing version

`npm i -g node-pkware`

recommended node version: 8.5+

tested in node version 14.9.0

## command line interface

// TODO: add documentation

## using as a library

// TODO: add documentation

## misc

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

**Analogue code on how stream handling should look like with higher order functions**

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

// outputData = 'abcdefGHIJKLMNOPQ'
```
