/**
 * Returns a byte view over the input without copying it.
 *
 * A `Buffer` is a `Uint8Array`, so it is a valid input for the codec, but it is not an
 * `ArrayBuffer`. Since `Buffer` became generic (`Buffer<ArrayBuffer>`) it is not assignable to
 * `ArrayBufferLike` anymore, which is why the input is typed as the union of the two here and the
 * view is made in one place: a single `new Uint8Array(input)` can not resolve its overloads for the
 * union, and copying a typed array which is already a byte view would be wasteful.
 *
 * @param input The bytes of the input.
 * @returns The byte view of the input.
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/pull/70694
 */
export function asByteView(input: ArrayBufferLike | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return input
  }

  return new Uint8Array(input)
}
