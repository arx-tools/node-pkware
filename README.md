# node-pkware

nodejs implementation of StormLib compression/decompression algorithm

it was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation / update existing version

`npm i -g node-pkware`

recommended node version: 8.5+

tested in node version 12.7.0

## command line interface

`implode --input=<filename> --output=<filename> --ascii|--binary --level=1|2|3` - compresses file.
if `--output` is omitted, then output will be placed next to input and names as `<filename>.compressed`.
optionally you can specify an offset from which the compressed data starts with the `--offset <byte>`,
which is useful for mixed files, such as the fts files of Arx Fatalis

`explode --input=<filename> --output=<filename>` - decompresses file. if `--output` is omitted, then
output will be placed next to input and names as `<filename>.decompressed`. optionally you can
specify an offset from which the compressed data starts with the `--offset <byte>`, which is useful
for mixed files, such as the fts files of Arx Fatalis

## examples

`explode --input=test/files/fast.fts --output=C:/fast.fts.decompressed --offset=1816`

`implode --input=test/files/fast.fts.unpacked --output=C:/fast.fts --binary --level=3 --offset=1816`

## sources:

* https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
* https://github.com/ShieldBattery/implode-decoder

### helpful links:

* https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
* https://stackoverflow.com/a/49394095/1806628
