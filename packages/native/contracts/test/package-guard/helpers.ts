import { describe, expect, it } from 'vitest'
import {
  isForbiddenNativeAssetReference,
  isForbiddenNativePayload,
} from '../../src'

describe('native runtime package guard helper predicates', () => {
  it('matches native payload extensions case-insensitively', () => {
    expect(isForbiddenNativePayload('Plugins/Renderer.DYLIB')).toBe(true)
    expect(isForbiddenNativePayload('native/plugin.dll?raw')).toBe(true)
    expect(isForbiddenNativePayload('native/helper.wasm#runtime')).toBe(true)
    expect(isForbiddenNativePayload('native/helper.wasm?cache=1#runtime')).toBe(true)
    expect(isForbiddenNativePayload('ui/menu.qui.json')).toBe(false)
  })

  it('matches forbidden native asset references across path styles', () => {
    expect(isForbiddenNativeAssetReference('https://example.invalid/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('/absolute/asset.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('C:\\native\\plugin.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('ui\\panel.png')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/../escape.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts//opening.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/./opening.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/')).toBe(true)
    expect(isForbiddenNativeAssetReference(' scripts/opening.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/opening.js ')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/\u001Bopening.js')).toBe(true)
    expect(isForbiddenNativeAssetReference('')).toBe(true)
    expect(isForbiddenNativeAssetReference('   #empty')).toBe(true)
    expect(isForbiddenNativeAssetReference('?empty')).toBe(true)
    expect(isForbiddenNativeAssetReference('scripts/opening.js')).toBe(false)
    expect(isForbiddenNativeAssetReference('ui/menu.qui.json')).toBe(false)
  })
})
