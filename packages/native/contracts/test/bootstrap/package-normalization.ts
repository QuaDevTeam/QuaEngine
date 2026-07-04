import { describe, expect, it } from 'vitest'
import {
  collectTargetCoreAdapterRoots,
  normalizePackageSpecifier,
} from '../../src'

describe('target core package normalization', () => {
  it('normalizes package subentries before validating isolation', () => {
    expect(normalizePackageSpecifier('@quajs/renderer-web/plugins/audio')).toBe('@quajs/renderer-web')
    expect(normalizePackageSpecifier('@quajs/renderer-web/plugins/audio?import#hash')).toBe('@quajs/renderer-web')
    expect(normalizePackageSpecifier('npm:@quajs/renderer-web/plugins/audio?import')).toBe('@quajs/renderer-web')
    expect(normalizePackageSpecifier('@quajs/cocos-host/testing')).toBe('@quajs/cocos-host')
    expect(normalizePackageSpecifier('quajs_wgpu_renderer::plugins::audio')).toBe('quajs_wgpu_renderer')
    expect(normalizePackageSpecifier('/repo/node_modules/@quajs/renderer-web/plugins/audio.js')).toBe('@quajs/renderer-web')
    expect(normalizePackageSpecifier('C:\\repo\\node_modules\\@quajs\\cocos-host\\runtime.js')).toBe('@quajs/cocos-host')
    expect(normalizePackageSpecifier('/repo/node_modules/lodash/fp.js')).toBe('lodash')
    expect(normalizePackageSpecifier('/repo/node_modules/.pnpm/@quajs+engine-native@0.1.0/node_modules/@quajs/engine-native/runtime.js')).toBe('@quajs/engine-native')
    expect(normalizePackageSpecifier('/repo/node_modules/.pnpm/@quajs+renderer-web@0.1.0')).toBe('@quajs/renderer-web')
  })

  it('collects normalized target core adapter roots for runtime package guards', () => {
    const roots = collectTargetCoreAdapterRoots()

    expect(roots.has('@quajs/renderer-web')).toBe(true)
    expect(roots.has('@quajs/cocos-host')).toBe(true)
    expect(roots.has('@quajs/engine-native')).toBe(true)
    expect(roots.has('@quajs/native-contracts')).toBe(true)
    expect(roots.has('quajs_wgpu_renderer')).toBe(true)
    expect(roots.has('@quajs/character')).toBe(false)
  })
})
