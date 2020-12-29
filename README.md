# node-pkware

TODO: once there is functionality again add instructions on how to use it

## Analogue code on how stream handling should look like with higher order functions

```javascript
const { compose, apply, useWith, concat, splitAt } = require('ramda')

const splitAtIndex = (idx) => input => {
  return splitAt(idx)(input)
}

const parseString = (splitter, left, right) => input => {
  return compose(
    apply(useWith(concat, [left, right])),
    splitter
  )(input)
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