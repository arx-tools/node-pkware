# node-pkware

nodejs implementation of StormLib compression/decompression algorhythms

it was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation

`npm i -g node-pkware`

recommended node version: 8.5+

tested in node version 12.7.0

## command line interface

`implode --filename=<path to uncompressed file>` - compresses file. output will be placed next to
the given file and named as `<filename>.compressed`

`explode --filename=<path to compressed file>` - decompresses file. output will be placed next to
the given file and names as `<filename>.decompressed`

## sources:

* https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
* https://github.com/ShieldBattery/implode-decoder

### helpful links:

* https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
* https://stackoverflow.com/a/49394095/1806628
