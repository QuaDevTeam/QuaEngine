import { expect, it } from 'vitest'
import { resolveReloadStep } from '../src/preview/reload-position.js'

it('keeps edited dialogue, follows insertions, and resets deleted or ambiguous steps', () => {
  expect(resolveReloadStep(['a', 'b', 'c'], ['a', 'new b', 'c'], 1)).toEqual({ index: 1, reset: false })
  expect(resolveReloadStep(['a', 'b', 'c'], ['insert', 'a', 'b', 'c'], 1)).toEqual({ index: 2, reset: false })
  expect(resolveReloadStep(['a', 'b', 'c'], ['a', 'c'], 1)).toEqual({ index: 0, reset: true })
  expect(resolveReloadStep(['a', 'b', 'c'], ['a', 'c'], 2)).toEqual({ index: 1, reset: false })
  expect(resolveReloadStep(['a'], [], 0)).toEqual({ index: 0, reset: true })
  expect(resolveReloadStep(['a', 'b', 'c'], ['x', 'y'], 1)).toEqual({ index: 0, reset: true })
})
