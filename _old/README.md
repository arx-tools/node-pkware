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

There is an `--auto-detect` flag, which will search for the first pkware header starting from the
beginning of the file. If `--offset` is defined, then it will start searching from that point.

## examples

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=1816`

`explode test/files/fast.fts --output=C:/fast.fts.decompressed --offset=0x718`

`implode test/files/fast.fts.unpacked --output=C:/fast.fts --binary --level=3 --offset=1816`

`explode test/files/fast.fts --auto-detect --debug --output=E:/fast.fts.unpacked`

`explode test/files/fast.fts --auto-detect --debug --output=E:/fast.fts.unpacked --offset=2000`

### piping also works

`cat c:/arx/level8.llf | explode > c:/arx/level8.llf.unpacked`

`explode c:/arx/level8.llf > c:/arx/level8.llf.unpacked`

`cat c:/arx/level8.llf | explode --output=c:/arx/level8.llf.unpacked`

`cat e:/piping/level8.llf.unpacked | implode --binary --level=3 > e:/piping/level8.llf.comp2`

`implode e:/piping/level8.llf.unpacked --binary --level=3 > e:/piping/level8.llf.comp`

`cat e:/piping/level8.llf.unpacked | implode --binary --level=3 --output="e:/piping/level8.llf.comp2"`
