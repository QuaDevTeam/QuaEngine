import type { AssetRuntimeAdapter } from '@quajs/assets'
import type { SettingsApplyContext } from '../src'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BASE_SETTINGS_SCOPE,
  createMemorySettingsStorage,
  emitSettingsRenderToLogic,
  getSettingsBridge,
  getSettingsDeveloperValues,
  getSettingsPlayerValues,
  getSettingsProjection,
  registerSettingsScope,
  SETTINGS_PLUGIN_ID,
  SettingsPlugin,
  SettingsRenderToLogicEvents,
  updatePlayerSettingsWithEngine,
} from '../src'

describe('@quajs/plugin-settings', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('collects pending scoped contributions and exposes only player settings to the renderer', async () => {
    const engine = createEngine()
    const apply = vi.fn()
    registerDemoScope(engine, apply)
    engine.use(new SettingsPlugin({ builtin: false }))

    await engine.init()

    const projection = getSettingsProjection(engine)
    expect(projection).toEqual(expect.objectContaining({
      profileId: 'default',
      scopes: expect.objectContaining({
        demo: expect.objectContaining({
          title: 'Demo',
          values: { volume: 0.8 },
          defaults: { volume: 0.8 },
        }),
      }),
    }))
    expect(projection?.scopes.demo.schema.properties).toHaveProperty('volume')
    expect(projection?.scopes.demo.schema.properties).not.toHaveProperty('internalToken')
    expect(getSettingsDeveloperValues(engine, 'demo')).toEqual({ secret: 'developer-only' })
    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({ volume: 0.8, internalToken: 'runtime-only' })
    expect(engine.getViewState().plugins[SETTINGS_PLUGIN_ID]).toEqual(projection)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'demo',
      reason: 'init',
      developer: { secret: 'developer-only' },
      player: { volume: 0.8, internalToken: 'runtime-only' },
    }))
  })

  it('applies renderer update intents, validates exposed fields, and persists player overrides', async () => {
    const engine = createEngine()
    const storage = createMemorySettingsStorage()
    const apply = vi.fn()
    registerDemoScope(engine, apply)
    engine.use(new SettingsPlugin({ builtin: false, profileId: 'player-1', storage }))
    await engine.init()

    await emitSettingsRenderToLogic(engine.getPipeline(), SettingsRenderToLogicEvents.UPDATE_REQUEST, {
      scope: 'demo',
      patch: { volume: 0.25 },
    })

    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({ volume: 0.25, internalToken: 'runtime-only' })
    await expect(storage.loadProfile('player-1')).resolves.toEqual(expect.objectContaining({
      profileId: 'player-1',
      scopes: {
        demo: { volume: 0.25 },
      },
    }))
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({
      reason: 'update',
      changedKeys: ['volume'],
      player: { volume: 0.25, internalToken: 'runtime-only' },
    }))

    await emitSettingsRenderToLogic(engine.getPipeline(), SettingsRenderToLogicEvents.UPDATE_REQUEST, {
      scope: 'demo',
      patch: { internalToken: 'leak' },
    })

    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({ volume: 0.25, internalToken: 'runtime-only' })
    expect(getSettingsProjection(engine)?.scopes.demo.errors?.[0]).toEqual(expect.objectContaining({
      keyword: 'expose',
    }))
  })

  it('rejects read-only exposed settings from renderer updates', async () => {
    const engine = createEngine()
    registerReadonlyScope(engine)
    engine.use(new SettingsPlugin({ builtin: false }))
    await engine.init()

    const result = await updatePlayerSettingsWithEngine(engine, 'readonly-demo', {
      buildLabel: 'patched',
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      errors: [expect.objectContaining({ keyword: 'readOnly' })],
    }))
    expect(getSettingsPlayerValues(engine, 'readonly-demo')).toEqual({
      buildLabel: 'stable',
      volume: 0.7,
    })
    expect(getSettingsProjection(engine)?.scopes['readonly-demo'].values).toEqual({
      buildLabel: 'stable',
      volume: 0.7,
    })
  })

  it('filters nested renderer fields and rejects hidden or read-only nested patches', async () => {
    const engine = createEngine()
    registerSettingsScope(engine, {
      scope: 'nested-demo',
      player: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            profile: {
              type: 'object',
              additionalProperties: false,
              properties: {
                theme: {
                  type: 'string',
                  title: 'Theme',
                },
                secret: {
                  'type': 'string',
                  'title': 'Secret',
                  'x-qua-expose': false,
                },
                uiOnlyHidden: {
                  type: 'string',
                  title: 'UI Only Hidden',
                },
                locked: {
                  type: 'string',
                  title: 'Locked',
                },
              },
            },
          },
        },
        defaults: {
          profile: {
            theme: 'light',
            secret: 'keep',
            uiOnlyHidden: 'hidden',
            locked: 'stable',
          },
        },
        expose: {
          include: ['profile'],
          readonly: ['profile.locked'],
        },
        ui: {
          controls: {
            'profile.uiOnlyHidden': {
              hidden: true,
            },
          },
        },
      },
    })
    engine.use(new SettingsPlugin({ builtin: false }))
    await engine.init()

    const projectedProfile = getSettingsProjection(engine)?.scopes['nested-demo'].schema.properties?.profile
    expect(projectedProfile?.properties).toHaveProperty('theme')
    expect(projectedProfile?.properties).toHaveProperty('locked')
    expect(projectedProfile?.properties?.locked.readOnly).toBe(true)
    expect(projectedProfile?.properties).not.toHaveProperty('secret')
    expect(projectedProfile?.properties).not.toHaveProperty('uiOnlyHidden')
    expect(getSettingsProjection(engine)?.scopes['nested-demo'].values).toEqual({
      profile: {
        theme: 'light',
        locked: 'stable',
      },
    })

    await expect(updatePlayerSettingsWithEngine(engine, 'nested-demo', {
      profile: {
        secret: 'leak',
      },
    })).resolves.toEqual(expect.objectContaining({
      ok: false,
      errors: [expect.objectContaining({ keyword: 'expose', path: 'profile.secret' })],
    }))

    await expect(updatePlayerSettingsWithEngine(engine, 'nested-demo', {
      profile: {
        locked: 'patched',
      },
    })).resolves.toEqual(expect.objectContaining({
      ok: false,
      errors: [expect.objectContaining({ keyword: 'readOnly', path: 'profile.locked' })],
    }))

    await expect(updatePlayerSettingsWithEngine(engine, 'nested-demo', {
      profile: {
        theme: 'dark',
      },
    })).resolves.toEqual(expect.objectContaining({ ok: true }))
    expect(getSettingsPlayerValues(engine, 'nested-demo')).toEqual({
      profile: {
        theme: 'dark',
        secret: 'keep',
        uiOnlyHidden: 'hidden',
        locked: 'stable',
      },
    })
  })

  it('does not persist or keep player overrides when an apply hook fails', async () => {
    const engine = createEngine()
    const storage = createMemorySettingsStorage()
    registerFailingApplyScope(engine)
    engine.use(new SettingsPlugin({ builtin: false, profileId: 'player-apply', storage }))
    await engine.init()

    const result = await updatePlayerSettingsWithEngine(engine, 'failing-apply', {
      enabled: true,
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      errors: [expect.objectContaining({ keyword: 'apply' })],
    }))
    expect(getSettingsPlayerValues(engine, 'failing-apply')).toEqual({ enabled: false })
    await expect(storage.loadProfile('player-apply')).resolves.toBeUndefined()
  })

  it('keeps settings available when profile storage load fails', async () => {
    const engine = createEngine()
    const onError = vi.fn(() => {
      throw new Error('settings observer failed')
    })
    registerDemoScope(engine)
    engine.use(new SettingsPlugin({
      builtin: false,
      storage: {
        loadProfile: vi.fn(async () => {
          throw new Error('settings profile unavailable')
        }),
        saveProfile: vi.fn(),
      },
      onError,
    }))

    await expect(engine.init()).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { reason: 'init' })
    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({
      volume: 0.8,
      internalToken: 'runtime-only',
    })
    expect(getSettingsProjection(engine)?.scopes.demo.values).toEqual({ volume: 0.8 })
  })

  it('keeps in-memory player settings when profile persistence fails', async () => {
    const engine = createEngine()
    const onError = vi.fn()
    registerDemoScope(engine)
    engine.use(new SettingsPlugin({
      builtin: false,
      storage: {
        loadProfile: vi.fn(async () => undefined),
        saveProfile: vi.fn(async () => {
          throw new Error('settings profile save failed')
        }),
      },
      onError,
    }))
    await engine.init()

    const result = await updatePlayerSettingsWithEngine(engine, 'demo', {
      volume: 0.25,
    })

    expect(result).toEqual(expect.objectContaining({ ok: true }))
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { reason: 'update' })
    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({
      volume: 0.25,
      internalToken: 'runtime-only',
    })
    expect(getSettingsProjection(engine)?.scopes.demo.values).toEqual({ volume: 0.25 })
  })

  it('keeps player settings from being restored by game save/load flow', async () => {
    const engine = createEngine()
    const storage = createMemorySettingsStorage()
    registerDemoScope(engine)
    engine.use(new SettingsPlugin({ builtin: false, storage }))
    await engine.init()

    await updatePlayerSettingsWithEngine(engine, 'demo', { volume: 0.3 })
    await engine.setStoryPoint({ sceneId: 'scene-1', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Saved line' })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })

    await updatePlayerSettingsWithEngine(engine, 'demo', { volume: 0.9 })
    await engine.showDialogue({ text: 'Changed line' })
    await engine.quickLoad()

    expect(engine.getViewState().dialogue.text).toBe('Saved line')
    expect(getSettingsPlayerValues(engine, 'demo')).toEqual({ volume: 0.9, internalToken: 'runtime-only' })
    expect(getSettingsProjection(engine)?.scopes.demo.values).toEqual({ volume: 0.9 })
  })

  it('unregisters runtime package settings scopes while keeping player values for remount', async () => {
    const engine = createEngine()
    const plugin = new SettingsPlugin({ builtin: false })
    engine.use(plugin)
    await engine.init()
    registerRuntimeScope(engine)
    await getSettingsBridge(engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })
    await updatePlayerSettingsWithEngine(engine, 'runtime-demo', { intensity: 0.35 })

    expect(getSettingsProjection(engine)?.scopes['runtime-demo']).toEqual(expect.objectContaining({
      packageId: 'runtime.settings',
      values: { intensity: 0.35 },
    }))

    await plugin.onRuntimePackageUnload?.({
      engine,
      runtimePackage: {
        package: { id: 'runtime.settings', version: '1.0.0' },
      },
    } as any)

    expect(getSettingsProjection(engine)?.scopes['runtime-demo']).toBeUndefined()

    registerRuntimeScope(engine)
    await getSettingsBridge(engine)?.rebuildProjection({ reason: 'rebuild', apply: true, persist: false })

    expect(getSettingsProjection(engine)?.scopes['runtime-demo'].values).toEqual({ intensity: 0.35 })
  })

  it('provides a built-in core settings scope', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin())
    await engine.init()

    const projection = getSettingsProjection(engine)
    expect(projection?.scopes[BASE_SETTINGS_SCOPE]).toEqual(expect.objectContaining({
      values: expect.objectContaining({
        textSpeedCps: 45,
        autoAdvanceDelayMs: 1200,
        skipMode: 'read',
      }),
    }))
    expect(engine.getFlowControlState()).toEqual(expect.objectContaining({
      skipMode: 'read',
      timings: expect.objectContaining({ autoAdvanceDelayMs: 1200 }),
    }))

    await updatePlayerSettingsWithEngine(engine, BASE_SETTINGS_SCOPE, {
      autoAdvanceDelayMs: 2400,
      skipMode: 'all',
    })

    expect(engine.getFlowControlState()).toEqual(expect.objectContaining({
      skipMode: 'all',
      timings: expect.objectContaining({ autoAdvanceDelayMs: 2400 }),
    }))
  })
})

function registerDemoScope(engine: QuaEngine, apply = vi.fn()): void {
  registerSettingsScope(engine, {
    scope: 'demo',
    version: 1,
    title: 'Demo',
    developer: {
      defaults: {
        secret: 'developer-only',
      },
    },
    player: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          volume: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            title: 'Volume',
          },
          internalToken: {
            type: 'string',
            title: 'Internal Token',
          },
        },
      },
      defaults: {
        volume: 0.8,
        internalToken: 'runtime-only',
      },
      expose: {
        include: ['volume'],
      },
      ui: {
        controls: {
          volume: {
            control: 'slider',
            min: 0,
            max: 1,
            step: 0.05,
          },
        },
      },
    },
    apply: apply as (ctx: SettingsApplyContext) => void,
  })
}

function registerReadonlyScope(engine: QuaEngine): void {
  registerSettingsScope(engine, {
    scope: 'readonly-demo',
    player: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          buildLabel: {
            type: 'string',
            title: 'Build Label',
            readOnly: true,
          },
          volume: {
            type: 'number',
            title: 'Volume',
          },
        },
      },
      defaults: {
        buildLabel: 'stable',
        volume: 0.7,
      },
      expose: {
        include: ['buildLabel', 'volume'],
      },
    },
  })
}

function registerFailingApplyScope(engine: QuaEngine): void {
  registerSettingsScope(engine, {
    scope: 'failing-apply',
    player: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: {
            type: 'boolean',
            title: 'Enabled',
          },
        },
      },
      defaults: {
        enabled: false,
      },
    },
    apply: ({ player }) => {
      if (player.enabled) {
        throw new Error('apply failed')
      }
    },
  })
}

function registerRuntimeScope(engine: QuaEngine): void {
  registerSettingsScope(engine, {
    scope: 'runtime-demo',
    packageId: 'runtime.settings',
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
}

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
    name: 'settings-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
