import type { AssetRuntimeAdapter } from '@quajs/assets'
import { readFileSync } from 'node:fs'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { getSettingsDeveloperValues, getSettingsProjection, SettingsPlugin } from '@quajs/plugin-settings'
import { MemoryBackend } from '@quajs/store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeInventoryItemWithEngine,
  createInventoryDecoratorCompiler,
  getInventoryItemQuantityWithEngine,
  getInventoryProfile,
  getInventoryProjection,
  grantInventoryItemWithEngine,
  hasInventoryItemWithEngine,
  INVENTORY_PLUGIN_ID,
  INVENTORY_PROFILE_STORE_PREFIX,
  INVENTORY_SETTINGS_SCOPE,
  InventoryLogicEvents,
  InventoryPlugin,
  onInventoryLogic,
  registerInventoryCategoryWithEngine,
  registerInventoryItemWithEngine,
  removeRuntimePackageInventoryContentWithEngine,
  resetInventoryProfileWithEngine,
  setInventoryItemQuantityWithEngine,
} from '../src'

describe('@quajs/plugin-inventory', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('exposes profile defaults as developer settings only', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin({ builtin: false }))
    engine.use(new InventoryPlugin({ profileId: 'developer-profile' }))
    await engine.init()

    expect(getSettingsDeveloperValues(engine, INVENTORY_SETTINGS_SCOPE)).toEqual({
      defaultProfileId: 'developer-profile',
    })
    expect(getSettingsProjection(engine)?.scopes[INVENTORY_SETTINGS_SCOPE]).toBeUndefined()
    expect(getInventoryProjection(engine).profileId).toBe('developer-profile')
  })

  it('persists profile quantities and keeps them out of save/load rollback', async () => {
    const engine = createEngine()
    engine.use(new InventoryPlugin())
    await engine.init()
    await registerBaseItems(engine)

    await grantInventoryItemWithEngine(engine, 'item.key', 1)
    const storageManager = await (engine.getStore() as unknown as {
      getStorageManager: () => Promise<{ getSnapshot: (id: string) => Promise<{ storeName: string } | undefined> }>
    }).getStorageManager()
    const snapshot = await storageManager.getSnapshot(`${INVENTORY_PROFILE_STORE_PREFIX}default`)
    expect(snapshot?.storeName).toBe(`${INVENTORY_PROFILE_STORE_PREFIX}default`)

    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Saved line' })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })

    await grantInventoryItemWithEngine(engine, 'item.key', 2)
    await engine.showDialogue({ text: 'Changed line' })
    await engine.quickLoad()

    expect(engine.getViewState().dialogue.text).toBe('Saved line')
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key')).toBe(3)
  })

  it('enforces item registration, profile isolation, maxQuantity, and quantity events', async () => {
    const engine = createEngine()
    engine.use(new InventoryPlugin())
    await engine.init()
    await registerBaseItems(engine)

    const events: Array<{ itemId: string, quantity: number, delta: number }> = []
    const dispose = onInventoryLogic(engine.getPipeline(), InventoryLogicEvents.ITEM_CHANGED, (payload) => {
      events.push({ itemId: payload.itemId, quantity: payload.quantity, delta: payload.delta })
    })

    await expect(grantInventoryItemWithEngine(engine, 'missing.item')).rejects.toThrow('Inventory item "missing.item" is not registered.')
    await grantInventoryItemWithEngine(engine, 'item.key', { quantity: 2, profileId: 'slot-a' })
    await grantInventoryItemWithEngine(engine, 'item.key', 1, { profileId: 'slot-b' })

    expect(hasInventoryItemWithEngine(engine, 'item.key', { profileId: 'slot-a' })).toBe(true)
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key', { profileId: 'slot-a' })).toBe(2)
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key', { profileId: 'slot-b' })).toBe(1)
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key')).toBe(1)

    await expect(grantInventoryItemWithEngine(engine, 'item.key', 2, { profileId: 'slot-a' })).rejects.toThrow('exceeds maxQuantity 3')
    await consumeInventoryItemWithEngine(engine, 'item.key', 1, { profileId: 'slot-a' })
    await expect(consumeInventoryItemWithEngine(engine, 'item.key', 2, { profileId: 'slot-a' })).rejects.toThrow('cannot go below 0')

    expect(events.map(event => event.delta)).toEqual([2, 1, -1])
    dispose()
  })

  it('keeps runtime-package item definitions out of active view package refs and preserves profile records on unload', async () => {
    const engine = createEngine()
    engine.use(new InventoryPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.inventory', async (runtimeEngine) => {
      await registerInventoryCategoryWithEngine(runtimeEngine, {
        id: 'runtime',
        title: 'Runtime Items',
      })
      await registerInventoryItemWithEngine(runtimeEngine, {
        id: 'runtime.key',
        title: 'Runtime Key',
        categoryId: 'runtime',
        icon: { type: 'images', name: 'items/runtime-key.png' },
      })
    })

    const registered = getInventoryProjection(engine).definitions.find(item => item.id === 'runtime.key')
    expect(registered).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.inventory',
      requiredRuntimePackages: ['runtime.inventory'],
      icon: expect.objectContaining({ runtimePackageId: 'runtime.inventory' }),
    }))
    expect(engine.getRuntimeViewRequiredPackageIds()).not.toContain('runtime.inventory')

    await grantInventoryItemWithEngine(engine, 'runtime.key')
    await removeRuntimePackageInventoryContentWithEngine(engine, 'runtime.inventory')

    expect(getInventoryProfile(engine).items['runtime.key']).toEqual(expect.objectContaining({
      itemId: 'runtime.key',
      quantity: 1,
    }))
    expect(getInventoryProjection(engine).items.find(item => item.itemId === 'runtime.key')).toEqual(expect.objectContaining({
      available: false,
      quantity: 1,
    }))
  })

  it('supports set, clear, and profile reset operations', async () => {
    const engine = createEngine()
    engine.use(new InventoryPlugin())
    await engine.init()
    await registerBaseItems(engine)

    await setInventoryItemQuantityWithEngine(engine, 'item.key', 3)
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key')).toBe(3)

    await setInventoryItemQuantityWithEngine(engine, 'item.key', 0)
    expect(getInventoryItemQuantityWithEngine(engine, 'item.key')).toBe(0)

    await grantInventoryItemWithEngine(engine, 'item.key')
    await grantInventoryItemWithEngine(engine, 'item.note')
    await resetInventoryProfileWithEngine(engine)
    expect(getInventoryProfile(engine).items).toEqual({})
  })

  it('declares and lowers QuaScript decorators through package metadata', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(Object.keys(packageJson.quajs.decorators).sort()).toEqual([
      'ConsumeInventoryItem',
      'GrantInventoryItem',
      'SetInventoryItemQuantity',
    ])
    expect(packageJson.quajs.renderer).toBeUndefined()

    const compiler = createInventoryDecoratorCompiler()
    const compiled = compiler.compile({
      decorator: {
        name: 'GrantInventoryItem',
        args: ['item.key', { quantity: 2 }],
      },
    })
    expect(compiled.runtimeHelpers).toEqual(['grantInventoryItemWithEngine'])
    expect((compiled.call.callee as { name?: string }).name).toBe('grantInventoryItemWithEngine')

    const setCompiled = compiler.compile({
      decorator: {
        name: 'SetInventoryItemQuantity',
        args: ['item.key', 3, { source: 'test' }],
      },
    })
    expect(setCompiled.runtimeHelpers).toEqual(['setInventoryItemQuantityWithEngine'])
  })
})

async function registerBaseItems(engine: QuaEngine): Promise<void> {
  await registerInventoryCategoryWithEngine(engine, {
    id: 'keys',
    title: 'Keys',
  })
  await registerInventoryItemWithEngine(engine, {
    id: 'item.key',
    title: 'Key',
    categoryId: 'keys',
    maxQuantity: 3,
  })
  await registerInventoryItemWithEngine(engine, {
    id: 'item.note',
    title: 'Note',
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
    name: 'inventory-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
