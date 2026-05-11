import type { QuaStateSerializer } from '../src/index'
import { beforeEach, describe, expect, it } from 'vitest'
import { createStore, MemoryBackend, QuaStoreManager } from '../src/index'

const mapValuesSerializer: QuaStateSerializer = {
  serialize: (state) => {
    const typedState = state as { values: Map<string, number> }
    return {
      ...typedState,
      values: Array.from(typedState.values.entries()),
    }
  },
  deserialize: (serializedState) => {
    const typedState = serializedState as { values: [string, number][] }
    return {
      ...typedState,
      values: new Map(typedState.values),
    }
  },
}

describe('snapshot System', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName)
    }
    QuaStoreManager.resetStorageManager()
  })

  describe('individual Store Snapshots', () => {
    it('should create and restore snapshots', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0, name: 'initial' },
        storage: { backend: MemoryBackend }, // Use memory backend for testing
        mutations: {
          increment: (state) => {
            state.count++
          },
          setName: (state, name: string) => {
            state.name = name
          },
        },
      })

      // Modify state
      store.commit('increment')
      store.commit('setName', 'modified')
      expect(store.state.count).toBe(1)
      expect(store.state.name).toBe('modified')

      // Create snapshot
      const snapshotId = await store.snapshot('test-snapshot')
      expect(snapshotId).toBe('test-snapshot')

      // Modify state further
      store.commit('increment')
      store.commit('setName', 'further-modified')
      expect(store.state.count).toBe(2)
      expect(store.state.name).toBe('further-modified')

      // Restore snapshot with force option since there's existing data
      await store.restore(snapshotId, { force: true })
      expect(store.state.count).toBe(1)
      expect(store.state.name).toBe('modified')
    })

    it('should generate automatic snapshot IDs', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
      })

      const snapshotId = await store.snapshot()
      expect(snapshotId).toBeDefined()
      expect(typeof snapshotId).toBe('string')
      expect(snapshotId.length).toBeGreaterThan(0)
    })

    it('should throw error when restoring with existing data without force', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
        mutations: {
          increment: (state) => {
            state.count++
          },
        },
      })

      store.commit('increment')
      const snapshotId = await store.snapshot()

      store.commit('increment')
      expect(store.state.count).toBe(2)

      await expect(store.restore(snapshotId)).rejects.toThrow(
        'Cannot restore snapshot due to some data already exists in store. Use force option to override.',
      )
    })

    it('should restore with force option', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
        mutations: {
          increment: (state) => {
            state.count++
          },
        },
      })

      store.commit('increment')
      const snapshotId = await store.snapshot()

      store.commit('increment')
      expect(store.state.count).toBe(2)

      await store.restore(snapshotId, { force: true })
      expect(store.state.count).toBe(1)
    })

    it('should throw error for non-existent snapshot', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
      })

      await expect(store.restore('non-existent')).rejects.toThrow(
        'Snapshot with id "non-existent" not found.',
      )
    })

    it('should throw error when restoring snapshot from different store', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const _store1 = createStore({
        name: 'store1',
        state: { count: 1 },
        // Don't specify storage - let it use global storage
      })

      const _store2 = createStore({
        name: 'store2',
        state: { count: 2 },
        // Don't specify storage - let it use global storage
      })

      // Use manager snapshot so both stores can see it
      const snapshotId = await QuaStoreManager.snapshot('store1')

      await expect(_store2.restore(snapshotId)).rejects.toThrow(
        'Snapshot belongs to store "store1", not "store2".',
      )
    })
  })

  describe('global Snapshots (QuaStoreManager)', () => {
    it('should create and restore scoped snapshots for selected stores', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const engineStore = createStore({
        name: 'engine',
        state: { step: 'intro' },
        mutations: {
          setStep: (state, step: string) => {
            state.step = step
          },
        },
      })

      const progressionStore = createStore({
        name: 'progression',
        state: { charm: 1, inventory: ['snack'] },
        mutations: {
          setCharm: (state, charm: number) => {
            state.charm = charm
          },
          addItem: (state, item: string) => {
            state.inventory.push(item)
          },
        },
      })

      const uiStore = createStore({
        name: 'ui',
        state: { menuOpen: false },
        mutations: {
          openMenu: (state) => {
            state.menuOpen = true
          },
        },
      })

      progressionStore.commit('setCharm', 5)
      progressionStore.commit('addItem', 'ticket')
      const snapshotId = await QuaStoreManager.snapshotStores(['engine', 'progression'], 'selected-stores')

      engineStore.commit('setStep', 'changed')
      progressionStore.commit('setCharm', 9)
      progressionStore.commit('addItem', 'ring')
      uiStore.commit('openMenu')

      await QuaStoreManager.restoreStores(snapshotId, { force: true })

      expect(engineStore.state.step).toBe('intro')
      expect(progressionStore.state.charm).toBe(5)
      expect(progressionStore.state.inventory).toEqual(['snack', 'ticket'])
      expect(uiStore.state.menuOpen).toBe(true)
    })

    it('should use scoped snapshot and restore options', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const progressionStore = createStore({
        name: 'progression',
        state: { courage: 2 },
        mutations: {
          setCourage: (state, courage: number) => {
            state.courage = courage
          },
        },
      })

      progressionStore.commit('setCourage', 8)
      const snapshotId = await QuaStoreManager.snapshot({
        scope: ['progression'],
        id: 'progression-checkpoint',
      })

      progressionStore.commit('setCourage', 1)
      await QuaStoreManager.restore(snapshotId, {
        storeName: 'progression',
        force: true,
      })

      expect(progressionStore.state.courage).toBe(8)
    })

    it('should reject explicit restore targets missing from the snapshot', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const progressionStore = createStore({
        name: 'progression',
        state: { courage: 2 },
      })

      createStore({
        name: 'inventory',
        state: { items: ['ticket'] },
      })

      const snapshotId = await QuaStoreManager.snapshotStores(['progression'], 'progression-only')

      await expect(QuaStoreManager.restore(snapshotId, {
        storeName: 'inventory',
        force: true,
      })).rejects.toThrow('Snapshot "progression-only" does not contain store "inventory".')

      expect(progressionStore.state.courage).toBe(2)
    })

    it('should restore a single store from a scoped snapshot through restoreStore', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const progressionStore = createStore({
        name: 'progression',
        state: { charm: 1 },
        mutations: {
          setCharm: (state, charm: number) => {
            state.charm = charm
          },
        },
      })

      const inventoryStore = createStore({
        name: 'inventory',
        state: { items: ['snack'] },
        mutations: {
          addItem: (state, item: string) => {
            state.items.push(item)
          },
        },
      })

      progressionStore.commit('setCharm', 6)
      inventoryStore.commit('addItem', 'ticket')
      const snapshotId = await QuaStoreManager.snapshotStores(['progression', 'inventory'], 'restore-one-from-group')

      progressionStore.commit('setCharm', 2)
      inventoryStore.commit('addItem', 'ring')

      await QuaStoreManager.restoreStore('progression', snapshotId, { force: true })

      expect(progressionStore.state.charm).toBe(6)
      expect(inventoryStore.state.items).toEqual(['snack', 'ticket', 'ring'])
    })

    it('should auto restore global snapshots through the unified restore API', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const store1 = createStore({
        name: 'store1',
        state: { count: 1 },
        mutations: {
          setCount: (state, count: number) => {
            state.count = count
          },
        },
      })

      const store2 = createStore({
        name: 'store2',
        state: { value: 'a' },
        mutations: {
          setValue: (state, value: string) => {
            state.value = value
          },
        },
      })

      store1.commit('setCount', 4)
      store2.commit('setValue', 'saved')
      const snapshotId = await QuaStoreManager.snapshot({ scope: 'all', id: 'all-stores' })

      store1.commit('setCount', 10)
      store2.commit('setValue', 'changed')

      await QuaStoreManager.restore(snapshotId, { force: true })

      expect(store1.state.count).toBe(4)
      expect(store2.state.value).toBe('saved')
    })

    it('should include scope metadata in snapshot listings', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      createStore({ name: 'store1', state: { count: 1 } })
      createStore({ name: 'store2', state: { count: 2 } })

      await QuaStoreManager.snapshotStores(['store1', 'store2'], 'scoped-meta')

      const snapshots = await QuaStoreManager.listSnapshots()
      const snapshot = snapshots.find(item => item.id === 'scoped-meta')

      expect(snapshot?.scope).toEqual({
        type: 'stores',
        storeNames: ['store1', 'store2'],
      })
    })

    it('should use per-store serializers for scoped snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const statsStore = createStore({
        name: 'stats',
        state: { values: new Map([['charm', 1]]) },
        serializer: mapValuesSerializer,
        mutations: {
          setValue: (state, payload: { key: string, value: number }) => {
            state.values.set(payload.key, payload.value)
          },
        },
      })

      const inventoryStore = createStore({
        name: 'inventory',
        state: { items: ['snack'] },
        mutations: {
          addItem: (state, item: string) => {
            state.items.push(item)
          },
        },
      })

      statsStore.commit('setValue', { key: 'charm', value: 5 })
      inventoryStore.commit('addItem', 'ticket')
      const snapshotId = await QuaStoreManager.snapshotStores(['stats', 'inventory'], 'serialized-scoped')

      statsStore.commit('setValue', { key: 'charm', value: 9 })
      inventoryStore.commit('addItem', 'ring')

      await QuaStoreManager.restoreStores(snapshotId, { force: true })

      expect(statsStore.state.values).toBeInstanceOf(Map)
      expect(statsStore.state.values.get('charm')).toBe(5)
      expect(inventoryStore.state.items).toEqual(['snack', 'ticket'])
    })

    it('should use the global serializer for stores created through the manager', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })
      QuaStoreManager.configureSerialization(mapValuesSerializer)

      const statsStore = createStore({
        name: 'stats',
        state: { values: new Map([['focus', 2]]) },
        mutations: {
          setValue: (state, payload: { key: string, value: number }) => {
            state.values.set(payload.key, payload.value)
          },
        },
      })

      statsStore.commit('setValue', { key: 'focus', value: 7 })
      const snapshotId = await QuaStoreManager.snapshotStore('stats', 'global-serializer')

      statsStore.commit('setValue', { key: 'focus', value: 1 })
      await QuaStoreManager.restoreStore('stats', snapshotId, { force: true })

      expect(statsStore.state.values).toBeInstanceOf(Map)
      expect(statsStore.state.values.get('focus')).toBe(7)
    })

    it('should create and restore global snapshots', async () => {
      // Configure global storage to use memory backend for testing
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const store1 = createStore({
        name: 'store1',
        state: { count: 1 },
        mutations: {
          increment: (state) => {
            state.count++
          },
        },
      })

      const store2 = createStore({
        name: 'store2',
        state: { value: 'a' },
        mutations: {
          setValue: (state, value: string) => {
            state.value = value
          },
        },
      })

      // Modify both stores
      store1.commit('increment')
      store2.commit('setValue', 'b')
      expect(store1.state.count).toBe(2)
      expect(store2.state.value).toBe('b')

      // Create global snapshot
      const snapshotId = await QuaStoreManager.snapshotAll('global-test')
      expect(snapshotId).toBe('global-test')

      // Modify stores further
      store1.commit('increment')
      store2.commit('setValue', 'c')
      expect(store1.state.count).toBe(3)
      expect(store2.state.value).toBe('c')

      // Restore global snapshot
      await QuaStoreManager.restoreAll(snapshotId, { force: true })
      expect(store1.state.count).toBe(2)
      expect(store2.state.value).toBe('b')
    })

    it('should handle individual store snapshots through manager', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++
          },
        },
      })

      store.commit('increment')
      const snapshotId = await QuaStoreManager.snapshot('testStore', 'manager-test')

      store.commit('increment')
      expect(store.state.count).toBe(2)

      await QuaStoreManager.restoreStore('testStore', snapshotId, { force: true })
      expect(store.state.count).toBe(1)
    })

    it('should list snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const _store = createStore({
        name: 'testStore',
        state: { count: 0 },
        // Don't specify storage - let it use global storage
      })

      await QuaStoreManager.snapshot('testStore', 'snap-1')
      await QuaStoreManager.snapshot('testStore', 'snap-2')

      const snapshots = await QuaStoreManager.listSnapshots('testStore')
      expect(snapshots).toHaveLength(2)
      expect(snapshots.map(s => s.id)).toContain('snap-1')
      expect(snapshots.map(s => s.id)).toContain('snap-2')

      const allSnapshots = await QuaStoreManager.listSnapshots()
      expect(allSnapshots.length).toBeGreaterThanOrEqual(2)
    })

    it('should delete snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const _store = createStore({
        name: 'testStore',
        state: { count: 0 },
        // Don't specify storage - let it use global storage
      })

      await QuaStoreManager.snapshot('testStore', 'to-delete')

      let snapshots = await QuaStoreManager.listSnapshots('testStore')
      expect(snapshots.some(s => s.id === 'to-delete')).toBe(true)

      await QuaStoreManager.deleteSnapshot('to-delete')

      snapshots = await QuaStoreManager.listSnapshots('testStore')
      expect(snapshots.some(s => s.id === 'to-delete')).toBe(false)
    })

    it('should clear snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const _store1 = createStore({
        name: 'store1',
        state: { count: 0 },
        // Don't specify storage - let it use global storage
      })

      const _store2 = createStore({
        name: 'store2',
        state: { count: 0 },
        // Don't specify storage - let it use global storage
      })

      await QuaStoreManager.snapshot('store1', 'snap-1')
      await QuaStoreManager.snapshot('store2', 'snap-2')

      // Clear snapshots for specific store
      await QuaStoreManager.clearSnapshots('store1')

      const store1Snapshots = await QuaStoreManager.listSnapshots('store1')
      const store2Snapshots = await QuaStoreManager.listSnapshots('store2')

      expect(store1Snapshots).toHaveLength(0)
      expect(store2Snapshots).toHaveLength(1)

      // Clear all snapshots
      await QuaStoreManager.clearAllSnapshots()

      const allSnapshots = await QuaStoreManager.listSnapshots()
      expect(allSnapshots).toHaveLength(0)
    })

    it('should throw error when restoring non-existent global snapshot', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      await expect(QuaStoreManager.restoreAll('non-existent')).rejects.toThrow(
        'Snapshot with id "non-existent" not found.',
      )
    })

    it('should throw error when restoring individual snapshot as global', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const _store = createStore({
        name: 'testStore',
        state: { count: 0 },
        // Don't specify storage - let it use global storage
      })

      const snapshotId = await QuaStoreManager.snapshot('testStore', 'individual')

      await expect(QuaStoreManager.restoreAll(snapshotId)).rejects.toThrow(
        `Snapshot "${snapshotId}" is not a global snapshot.`,
      )
    })
  })
})
