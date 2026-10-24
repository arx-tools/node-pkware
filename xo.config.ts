import unusedImports from 'eslint-plugin-unused-imports'
import type { FlatXoConfig, XoConfigItem } from 'xo'

const rules = {
  'capitalized-comments': 'off',
  'no-bitwise': 'off',
  'no-warning-comments': 'off',
  '@typescript-eslint/no-extraneous-class': 'off',
  'unicorn/filename-case': 'off',
  'unicorn/no-array-callback-reference': 'off',
  'unicorn/no-static-only-class': 'off',
  'unicorn/prefer-math-trunc': 'off',
  'unicorn/prefer-module': 'off',
  'unicorn/prevent-abbreviations': 'off',
  curly: ['error', 'all'],
  'func-style': ['error', 'declaration'],
  'no-use-before-define': ['error', { functions: true, classes: true, variables: true, allowNamedExports: false }],
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
  ],
  '@typescript-eslint/class-literal-property-style': ['error', 'fields'],
  '@typescript-eslint/prefer-literal-enum-member': ['error', { allowBitwiseExpressions: true }],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
  ],
  '@typescript-eslint/explicit-function-return-type': 'error',
  '@typescript-eslint/array-type': [
    'error',
    {
      default: 'array-simple',
    },
  ],
  '@typescript-eslint/parameter-properties': ['error', { prefer: 'class-property' }],
  'operator-assignment': ['error', 'never'],
  'logical-assignment-operators': ['error', 'never'],
  '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true, ignoreProperties: true }],
  '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
  // the codebase works with a lot of fractional numbers (the float32 values of the formats), so the
  // fractions are grouped in threes as well. the integers are left alone below five digits (2800
  // stays 2800), so the coordinate tables of the formats keep their alignment
  'unicorn/numeric-separators-style': [
    'error',
    { number: { fractionGroupLength: 3, groupLength: 3, minimumDigits: 5 } },
  ],
  'unicorn/prefer-ternary': 'off',
  'no-ternary': 'error',
  'no-await-in-loop': 'off',
  '@typescript-eslint/consistent-type-definitions': 'off',
  '@typescript-eslint/non-nullable-type-assertion-style': 'off',
  // the opposite of `prefer-number-properties`: that one is the chosen direction (the global
  // `Infinity` and `NaN` are not available in every context), so this rule can not stay on
  'unicorn/prefer-global-number-constants': 'off',
  'unicorn/prefer-number-properties': ['error', { checkInfinity: true, checkNaN: true }],
  'unused-imports/no-unused-imports': 'error',
  'guard-for-in': 'off',
  'arrow-body-style': ['error', 'always'],
  '@typescript-eslint/unified-signatures': 'off',
  'unicorn/no-for-loop': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  'object-shorthand': ['error', 'always', { avoidQuotes: true }],
  '@typescript-eslint/no-import-type-side-effects': 'error',
  'unicorn/prefer-string-raw': 'off',
  // xo 5's bundled prettier defaults flip the object brace spacing, the repositories keep `{ a, b }`
  'prettier/prettier': ['error', { bracketSpacing: true }],
  // keep the classic JSDoc style with the asterisk prefix (xo's default flipped to "never")
  'jsdoc/require-asterisk-prefix': ['error', 'always'],
  // the node stream callbacks are `void | Promise<void>` by contract (promisify, the Transform
  // options, the _flush assignment), so a value-returning function is not a bug here
  '@typescript-eslint/strict-void-return': 'off',
  // a promise is always awaited: a rejection is handled where it happens, the stack trace stays
  // useful, and an async function does not quietly return a floating promise
  '@typescript-eslint/return-await': ['error', 'always'],
  '@typescript-eslint/require-await': 'error',
  // every description is a complete sentence: a capital first letter and a period at the end, so it
  // does not have to be checked by hand
  'jsdoc/require-description-complete-sentence': 'error',
  // the description comes first, then an empty line before the @ tags
  'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
  // every thrown error is documented with @throws, including the callers of a throwing function
  'jsdoc/require-throws': 'error',
  // statics first, then the instance fields, the constructor and the methods from public to private
  '@typescript-eslint/member-ordering': [
    'error',
    {
      default: [
        'public-static-field',
        'protected-static-field',
        'private-static-field',
        'public-static-method',
        'protected-static-method',
        'private-static-method',
        'public-instance-field',
        'protected-instance-field',
        'private-instance-field',
        'constructor',
        'public-instance-method',
        'protected-instance-method',
        'private-instance-method',
      ],
    },
  ],
  // `operator-assignment: never` is the convention here (the long form shows what changes), and the
  // unicorn variant wants the same rule with the opposite setting
  'unicorn/operator-assignment': 'off',
  // the public boolean names (verbose, isFirstChunk, ...) are part of the published API
  'unicorn/consistent-boolean-name': 'off',
  // the codec is a port of the C implementation and keeps its names (LenBits, LenCode, ...)
  'unicorn/name-replacements': 'off',
  // the pkware algorithm breaks out of nested loops exactly like the C original
  'unicorn/no-break-in-nested-loop': 'off',
  // the raw bytes are validated against the numeric enums with `value in Enum`
  'unicorn/no-computed-property-existence-check': 'off',
  // every field is assigned in the constructor, so all values are initialized the same way
  'unicorn/prefer-class-fields': 'off',
  // TODO: rename the shadowed `byte` variables in src/simple/Implode.ts when that method is touched
  '@typescript-eslint/no-shadow': 'off',
  // reduce is banned everywhere: the loop is always clearer than the accumulator dance
  'unicorn/no-array-reduce': 'error',
  // the sources import the real `.ts` files so node can run them without a build, and `tsc`
  // rewrites them to `.js` in the emitted package (`rewriteRelativeImportExtensions`)
  'n/file-extension-in-import': 'off',
  // the project convention prefers `Number.parseInt(value, 10)` over the bare `Number(value)`
  'unicorn/prefer-number-coercion': 'off',
  // the stream handlers reach these members through the aliased `this` (see the no-this-alias
  // reasoning), the rule can not follow that, so it reports used members as unused
  '@typescript-eslint/no-unused-private-class-members': 'off',
  // the codec's hot loops are written after the C original: the guards, the early exits and the
  // shared branch prefixes stay where they are, restructuring them would only churn the port
  'unicorn/prefer-combined-guards': 'off',
  'unicorn/prefer-hoisting-branch-code': 'off',
  'unicorn/prefer-continue': 'off',
  'unicorn/prefer-early-return': 'off',
  'unicorn/no-declarations-before-early-exit': 'off',
  'n/no-sync': 'error',
  // the `v` flag needs Node >= 20, but the published package still supports Node >= 18
  'require-unicode-regexp': 'off',
  // the member order follows the C port, reordering it would only churn the codec's structure
  'unicorn/consistent-class-member-order': 'off',
  // `_flush` mirrors node's Transform callback contract, the handlers attach the final flush to it
  'unicorn/prefer-private-class-fields': 'off',
  // 31 Buffer + 2 null type positions in src/stream/* and src/simple/* are this codec's public API: the ban would change the published typings
  '@typescript-eslint/no-restricted-types': 'off',
} satisfies NonNullable<XoConfigItem['rules']>

const xoConfig: FlatXoConfig = [
  {
    // the base style, these options are only allowed on a global item
    space: true,
    semicolon: false,
    prettier: true,
  },
  {
    // xo transpiles this typescript config into `xo.config.mjs` in the repository root, a leftover from
    // an aborted run would be linted as plain javascript and flood the report with false positives
    ignores: ['xo.config.mjs'],
  },
  {
    // the documentation and the package metadata have their own conventions (the README mirrors the
    // arx-tools style, the package.json follows npm's, not xo's opinionated reshuffle)
    ignores: ['**/*.md', 'package.json'],
  },
  {
    // the tsconfigs are JSONC (tsc --init puts the explanation of the options in the file), and the
    // prettier parser of xo does not accept comments in a json file
    ignores: ['tsconfig*.json'],
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    files: ['src/**/*.ts'],
    // there is no `tsconfig.json` in the repository, so the project has to be wired explicitly
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.src.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    files: ['tests/**/*.ts'],
    // the tests have their own (noEmit) project which includes the sources they import
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.tests.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    files: ['scripts/**/*.ts', 'xo.config.ts'],
    // the tooling files (the build script and this config) live outside of the src tsconfig,
    // they have their own (noEmit) project
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.scripts.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules,
  },
]

export default xoConfig
