import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getSettingsBridge,
  getSettingsProjection,
  registerSettingsScope,
  SettingsPlugin,
} from '../src'

describe('@quajs/plugin-settings runtime packages', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('tags settings scopes registered through package-scoped engine facades', async () => {
    const engine = createEngine()
    const plugin = new SettingsPlugin({ builtin: false })
    engine.use(plugin)
    await engine.init()

    await engine.withRuntimePackageContext('runtime.settings', async (runtimeEngine) => {
      registerSettingsScope(runtimeEngine, {
        scope: 'runtime-demo',
        player: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              intensity: {
                type: 'number',
                minimum: 0,
                maximum: 1,
              },
            },
          },
          defaults: {
            intensity: 0.8,
          },
        },
      })
    })
    await getSettingsBridge(engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })

    expect(getSettingsProjection(engine)?.scopes['runtime-demo']).toEqual(expect.objectContaining({
      packageId: 'runtime.settings',
    }))

    await plugin.onRuntimePackageUnload?.({
      engine,
      runtimePackage: {
        package: { id: 'runtime.settings', version: '1.0.0' },
      },
    } as any)

    expect(getSettingsProjection(engine)?.scopes['runtime-demo']).toBeUndefined()
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
    name: 'settings-runtime-package-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
