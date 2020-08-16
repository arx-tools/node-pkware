# node-pkware

nodejs implementation of StormLib compression/decompression algorhythms

it was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation

`npm i -g node-pkware`

recommended node version: 8.5+

tested in node version 12.7.0

## command line interface

`implode --input=<filename> --output=<filename> --ascii|--binary --level=1|2|3` - decompresses file.
if `--output` is omitted, then output will be placed next to input and names as `<filename>.compressed`

`explode --input=<filename> --output=<filename>` - decompresses file. if `--output` is omitted, then
output will be placed next to input and names as `<filename>.decompressed`. optionally you can
specify an offset from which the compressed data starts with the `--offset <byte>`, which is useful
for mixed files, such as the fts files of Arx Fatalis

## sources:

* https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
* https://github.com/ShieldBattery/implode-decoder

### helpful links:

* https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
* https://stackoverflow.com/a/49394095/1806628
