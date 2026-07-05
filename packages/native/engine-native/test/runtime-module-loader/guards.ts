import { describe, expect, it } from 'vitest'
import {
  createModuleLoadContext,
  createNativeRuntimeModuleLoader,
} from './helpers'

describe('@quajs/engine-native runtime module loader guards', () => {
  it('rejects native runtime modules without package-relative asset names', async () => {
    const { calls, ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadEnginePluginModule?.({
      id: 'bad-plugin',
      kind: 'engine',
      module: 'https://example.invalid/plugin.js',
    }, ctx)).rejects.toThrow(/requires an assetName/)

    await expect(loader.loadScriptModule?.({
      id: 'escape',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '../escape.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'remote',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'https://example.invalid/remote.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'backslash',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts\\opening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'leading-space',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: ' scripts/opening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'trailing-space',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js ',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'control-char',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/\u001Bopening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'empty-segment',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts//opening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'dot-segment',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/./opening.js',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'directory',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'blank',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '   ',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'suffix-only',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: '?module',
    }, ctx)).rejects.toThrow(/package-relative script asset/)

    await expect(loader.loadScriptModule?.({
      id: 'native-payload',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/plugin.node',
    }, ctx)).rejects.toThrow(/must not reference a native payload/)

    await expect(loader.loadScriptModule?.({
      id: 'ui-ast',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'ui/menu.qui.json',
    }, ctx)).rejects.toThrow(/must reference a JavaScript module asset/)

    expect(calls).toEqual([])
  })

  it('rejects unsafe native runtime module variant asset names before asset loading', async () => {
    const { calls, ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => ({ default: undefined }),
    })

    await expect(loader.loadSceneModule?.({
      id: 'scene-with-escape',
      assetName: 'scenes/opening.js',
      variants: {
        escape: { module: '../outside-scene.js' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.escape\.module "\.\.\/outside-scene\.js" must be a package-relative script asset/)

    await expect(loader.loadEnginePluginModule?.({
      id: 'plugin-with-native-variant',
      kind: 'engine',
      assetName: 'plugins/settings.js',
      variants: {
        windows: { assetName: 'plugins/settings.dll' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.windows\.assetName "plugins\/settings\.dll" must not reference a native payload/)

    await expect(loader.loadStoreMigrationModule?.({
      id: 'migration-with-data-variant',
      assetName: 'migrations/save.js',
      variants: {
        data: { module: 'migrations/save.json' },
      },
    } as any, ctx)).rejects.toThrow(/variants\.data\.module "migrations\/save\.json" must reference a JavaScript module asset/)

    expect(calls).toEqual([])
  })

  it('accepts JavaScript module-like native runtime asset names', async () => {
    const { ctx } = createModuleLoadContext({
      'scripts/opening.mjs': 'export default function opening() {}',
      'scripts/opening.js?cache=1': 'export default function opening() {}',
      'migrations/save.cjs': 'module.exports = {}',
    })
    const loader = createNativeRuntimeModuleLoader({
      evaluator: input => ({ default: input.assetName }),
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.mjs',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.mjs' })
    await expect(loader.loadScriptModule?.({
      id: 'opening-cache',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js?cache=1',
    }, ctx)).resolves.toEqual({ default: 'scripts/opening.js?cache=1' })
    await expect(loader.loadScriptModule?.({
      id: 'native-payload-query',
      assetName: 'scripts/helper.wasm?raw',
    } as any, ctx)).rejects.toThrow(/assetName "scripts\/helper\.wasm\?raw" must not reference a native payload/)
    await expect(loader.loadStoreMigrationModule?.({
      id: 'save-v2',
      assetName: 'migrations/save.cjs',
    }, ctx)).resolves.toEqual({ default: 'migrations/save.cjs' })
  })

  it('rejects native runtime evaluators that do not return a module namespace object', async () => {
    const { ctx } = createModuleLoadContext()
    const loader = createNativeRuntimeModuleLoader({
      evaluator: () => undefined,
    })

    await expect(loader.loadScriptModule?.({
      id: 'opening',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
    }, ctx)).rejects.toThrow(/did not evaluate to a module namespace object/)
  })
})
