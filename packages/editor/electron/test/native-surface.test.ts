import { describe, expect, it } from 'vitest'
import { parseNativeSurface } from '../src/preview-host/native/surface.js'

describe('native compositor handshake', () => {
  const surface = { kind: 'ca-context', contextId: 123, width: 960, height: 540 }
  it('accepts a bounded context descriptor without image data', () => {
    expect(parseNativeSurface(surface)).toEqual(surface)
  })
  it('rejects obsolete image protocols, invalid handles and unbounded geometry before entering native code', () => {
    for (const value of [null, {}, { ...surface, kind: 'rgba8' }, { ...surface, contextId: 0 }, { ...surface, contextId: 2 ** 32 }, { ...surface, contextId: 1.5 }, { ...surface, width: Number.NaN }, { ...surface, height: 4097 }, { ...surface, width: 0 }])
      expect(() => parseNativeSurface(value)).toThrow('原生表面')
  })
})
