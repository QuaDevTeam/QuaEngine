import { describe, expect, it } from 'vitest'
import { getDefaultDeclarationOutputPath, getDefaultOutputPath } from '../src/cli/cli'

describe('quaScript CLI', () => {
  it('uses extension-aware default output paths', () => {
    expect(getDefaultOutputPath('scene.qs')).toBe('scene.compiled.ts')
    expect(getDefaultOutputPath('scene.ts')).toBe('scene.compiled.ts')
    expect(getDefaultOutputPath('scene.tsx')).toBe('scene.compiled.tsx')
    expect(getDefaultOutputPath('scene.js')).toBe('scene.compiled.js')
    expect(getDefaultOutputPath('scene.jsx')).toBe('scene.compiled.jsx')
    expect(getDefaultDeclarationOutputPath('scene.qs')).toBe('scene.d.qs.ts')
    expect(() => getDefaultOutputPath('scene.txt')).toThrow('Unsupported input extension')
    expect(() => getDefaultDeclarationOutputPath('scene.ts')).toThrow('only generated for .qs')
  })
})
