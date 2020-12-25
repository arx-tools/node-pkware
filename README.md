# node-pkware

nodejs implementation of StormLib compression/decompression algorithm

it was the de-facto compression for games from around Y2K, like Arx Fatalis

## installation / update existing version

`npm i -g node-pkware`

recommended node version: 8.5+

tested in node version 12.7.0

## command line interface

`implode <filename> --output=<filename> --ascii|--binary --level=1|2|3` - compresses file.
if `--output` is omitted, then output will be placed next to input and names as `<filename>.compressed`.
optionally you can specify an offset from which the compressed data starts with the `--offset=<int|hex>`,
which is useful for mixed files, such as the fts files of Arx Fatalis

`explode <filename> --output=<filename>` - decompresses file. if `--output` is omitted, then
output will be placed next to input and names as `<filename>.decompressed`. optionally you can
specify an offset from which the compressed data starts with the `--offset=<int|hex>`, which is useful
for mixed files, such as the fts files of Arx Fatalis

The `--drop-before-offset` flag tells node-pkware to drop the portion before `--offset`, otherwise
it will keep it untouched and attach it to the output file.

## examples

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=1816`

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=0x718`

`implode test/files/fast.fts.unpacked --output=C:/fast.fts --binary --level=3 --offset=1816`

### piping also works

`cat c:/arx/level8.llf | explode > c:/arx/level8.llf.unpacked`

`explode c:/arx/level8.llf > c:/arx/level8.llf.unpacked`

`cat c:/arx/level8.llf | explode --output=c:/arx/level8.llf.unpacked`


`cat e:/piping/level8.llf.unpacked | implode --binary --level=3 > e:/piping/level8.llf.comp2`

`implode e:/piping/level8.llf.unpacked --binary --level=3 > e:/piping/level8.llf.comp`

`cat e:/piping/level8.llf.unpacked | implode --binary --level=3 --output="e:/piping/level8.llf.comp2"`

## sources:

* https://github.com/ladislav-zezula/StormLib/tree/master/src/pklib
* https://github.com/ShieldBattery/implode-decoder

### helpful links:

* https://stackoverflow.com/questions/2094666/pointers-in-c-when-to-use-the-ampersand-and-the-asterisk
* https://stackoverflow.com/a/49394095/1806628

### TODOs:

to overcome gotos and other jumps in implode: introduce flags and wrap affected code parts
into if(flag) statements. that way the original intention of gotos in the code - being able
to skip parts of the code - could be done without gotos.

```
Goals:

[ ] make compression work with 1 chunk
[ ] make compression work with 2 chunks
[ ] make compression work with any number of chunks
```