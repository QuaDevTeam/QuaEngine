import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRuntimePackageFontsWithEngine,
  FONTS_PLUGIN_ID,
  FontsPlugin,
  getFontsProjection,
  registerFontWithEngine,
  registerFontsWithEngine,
  unregisterFontWithEngine,
} from '../src'

describe('@quajs/plugin-fonts', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('stores font face declarations in engine-owned plugin projection', async () => {
    const engine = createEngine()
    engine.use(new FontsPlugin())
    await engine.init()

    await registerFontWithEngine(engine, 'Qua Serif', 'display.woff2', {
      weight: 700,
      style: 'normal',
      display: 'swap',
    })

    const projection = getFontsProjection(engine)
    expect(projection.revision).toBe(1)
    expect(projection.faces).toEqual([
      expect.objectContaining({
        family: 'Qua Serif',
        assetName: 'display.woff2',
        weight: 700,
        display: 'swap',
      }),
    ])
    expect(engine.getViewState().plugins[FONTS_PLUGIN_ID]).toEqual(projection)
  })

  it('replaces matching font identities and supports unregistering by family', async () => {
    const engine = createEngine()
    engine.use(new FontsPlugin())
    await engine.init()

    await registerFontsWithEngine(engine, [
      { family: 'Qua Sans', assetName: 'regular.woff2', weight: 400 },
      { family: 'Qua Sans', assetName: 'bold.woff2', weight: 700 },
    ])
    await registerFontWithEngine(engine, 'Qua Sans', 'regular-next.woff2', { weight: 400 })

    expect(getFontsProjection(engine).faces).toEqual([
      expect.objectContaining({ assetName: 'regular-next.woff2', weight: 400 }),
      expect.objectContaining({ assetName: 'bold.woff2', weight: 700 }),
    ])

    await unregisterFontWithEngine(engine, 'Qua Sans')
    expect(getFontsProjection(engine).faces).toEqual([])
  })

  it('keeps unicode-range font subsets as separate faces', async () => {
    const engine = createEngine()
    engine.use(new FontsPlugin())
    await engine.init()

    await registerFontsWithEngine(engine, [
      { family: 'Qua Sans', assetName: 'latin.woff2', weight: 400, unicodeRange: 'U+0000-00FF' },
      { family: 'Qua Sans', assetName: 'cjk.woff2', weight: 400, unicodeRange: 'U+4E00-9FFF' },
    ])

    expect(getFontsProjection(engine).faces).toEqual([
      expect.objectContaining({ assetName: 'latin.woff2', unicodeRange: 'U+0000-00FF' }),
      expect.objectContaining({ assetName: 'cjk.woff2', unicodeRange: 'U+4E00-9FFF' }),
    ])
  })


  it('clears runtime package fonts on package unload', async () => {
    const engine = createEngine()
    engine.use(new FontsPlugin())
    await engine.init()
    await engine.setStoryPoint({ stepId: 'runtime-line', contentPackageId: 'runtime.story' })
    await registerFontWithEngine(engine, 'Runtime Serif', 'runtime.woff2')
    await registerFontWithEngine(engine, 'Base Serif', 'base.woff2', { contentPackageId: 'base' })

    await clearRuntimePackageFontsWithEngine(engine, 'runtime.story')

    expect(getFontsProjection(engine).faces).toEqual([
      expect.objectContaining({ family: 'Base Serif', contentPackageId: 'base' }),
    ])
  })

  it('tags fonts registered through package-scoped engine facades', async () => {
    const engine = createEngine()
    engine.use(new FontsPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.fonts', async (runtimeEngine) => {
      await registerFontWithEngine(runtimeEngine, 'Runtime Sans', 'runtime.woff2')
    })

    let projection = getFontsProjection(engine)
    expect(projection.faces).toEqual([
      expect.objectContaining({
        family: 'Runtime Sans',
        contentPackageId: 'runtime.fonts',
      }),
    ])
    expect(projection.requiredRuntimePackages).toEqual(['runtime.fonts'])
    expect(engine.getRuntimeViewRequiredPackageIds()).toEqual(['runtime.fonts'])

    await clearRuntimePackageFontsWithEngine(engine, 'runtime.fonts')

    projection = getFontsProjection(engine)
    expect(projection.faces).toEqual([])
    expect(projection.requiredRuntimePackages).toEqual([])
  })
})

function createEngine(): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
    },
  })
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'fonts-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
