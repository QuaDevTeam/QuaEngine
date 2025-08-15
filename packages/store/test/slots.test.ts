import { beforeEach, describe, expect, it } from 'vitest'
import { createStore, MemoryBackend, QuaStoreManager } from '../src/index'

describe('game Slot System', () => {
  beforeEach(async () => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName)
    }

    // Clear any global storage manager state
    const globalManager = await QuaStoreManager.getGlobalStorageManager()
    if (globalManager) {
      const backend = globalManager.getBackend()
      if (backend && typeof (backend as any).clearGameSlots === 'function') {
        await (backend as any).clearGameSlots()
      }
    }

    // Reset the global storage configuration to force clean state
    (QuaStoreManager as any).storageManager = null;
    (QuaStoreManager as any).globalStorageConfig = null
  })

  describe('store Slot Operations', () => {
    it('should save and load game slots', async () => {
      const store = createStore({
        name: 'gameStore',
        state: {
          level: 1,
          playerName: 'Alice',
          inventory: ['sword', 'potion'],
        },
        storage: { backend: MemoryBackend },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level
          },
          setPlayerName: (state, name: string) => {
            state.playerName = name
          },
          addItem: (state, item: string) => {
            state.inventory.push(item)
          },
        },
      })

      // Create some snapshots first
      await store.snapshot('checkpoint-1')
      store.commit('setLevel', 2)
      store.commit('addItem', 'shield')
      await store.snapshot('checkpoint-2')

      // Save to slot with metadata
      await store.saveToSlot('slot-1', {
        name: 'Main Quest - Forest',
        sceneName: 'forest_entrance',
        stepId: 'step_42',
        playtime: 3600000, // 1 hour in milliseconds
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      })

      // Modify store state
      store.commit('setLevel', 5)
      store.commit('setPlayerName', 'Bob')
      store.commit('addItem', 'magic_ring')

      expect(store.state.level).toBe(5)
      expect(store.state.playerName).toBe('Bob')
      expect(store.state.inventory).toContain('magic_ring')

      // Load from slot (should restore both state and snapshots)
      await store.loadFromSlot('slot-1', { force: true })

      expect(store.state.level).toBe(2)
      expect(store.state.playerName).toBe('Alice')
      expect(store.state.inventory).toEqual(['sword', 'potion', 'shield'])

      // Verify snapshots were restored
      const snapshots = await store.listSlots()
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].slotId).toBe('slot-1')
      expect(snapshots[0].name).toBe('Main Quest - Forest')
      expect(snapshots[0].metadata.sceneName).toBe('forest_entrance')
      expect(snapshots[0].metadata.stepId).toBe('step_42')
      expect(snapshots[0].metadata.playtime).toBe(3600000)
    })

    it('should throw error when loading non-existent slot', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      await expect(store.loadFromSlot('non-existent')).rejects.toThrow(
        'Game slot "non-existent" not found.',
      )
    })

    it('should throw error when loading with existing data without force', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level
          },
        },
      })

      // Save initial state
      await store.saveToSlot('slot-1')

      // Modify state
      store.commit('setLevel', 3)
      expect(store.state.level).toBe(3)

      // Try to load without force
      await expect(store.loadFromSlot('slot-1')).rejects.toThrow(
        'Cannot load from slot due to some data already exists in store. Use force option to override.',
      )
    })

    it('should load with force option', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level
          },
        },
      })

      // Save initial state
      await store.saveToSlot('slot-1')

      // Modify state
      store.commit('setLevel', 3)
      expect(store.state.level).toBe(3)

      // Load with force
      await store.loadFromSlot('slot-1', { force: true })
      expect(store.state.level).toBe(1)
    })

    it('should delete game slots', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      // Save multiple slots
      await store.saveToSlot('slot-1', { name: 'Save 1' })
      await store.saveToSlot('slot-2', { name: 'Save 2' })

      let slots = await store.listSlots()
      expect(slots).toHaveLength(2)

      // Delete one slot
      await store.deleteSlot('slot-1')

      slots = await store.listSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0].slotId).toBe('slot-2')
    })

    it('should list game slots', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      // Save multiple slots with different timestamps
      await store.saveToSlot('slot-1', { name: 'Save 1' })

      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10))

      await store.saveToSlot('slot-2', { name: 'Save 2' })

      const slots = await store.listSlots()
      expect(slots).toHaveLength(2)

      // Should be sorted by timestamp (newest first)
      expect(slots[0].slotId).toBe('slot-2') // Newest
      expect(slots[1].slotId).toBe('slot-1') // Older

      expect(slots[0].name).toBe('Save 2')
      expect(slots[1].name).toBe('Save 1')
    })

    it('should get specific game slot', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 5, playerName: 'Charlie' },
        storage: { backend: MemoryBackend },
      })

      await store.saveToSlot('detailed-slot', {
        name: 'Boss Fight',
        sceneName: 'dragon_lair',
        stepId: 'boss_intro',
        playtime: 7200000, // 2 hours
        difficulty: 'hard',
        completionPercent: 75,
      })

      const slot = await store.getSlot('detailed-slot')
      expect(slot).toBeDefined()
      expect(slot!.slotId).toBe('detailed-slot')
      expect(slot!.name).toBe('Boss Fight')
      expect(slot!.metadata.sceneName).toBe('dragon_lair')
      expect(slot!.metadata.stepId).toBe('boss_intro')
      expect(slot!.metadata.playtime).toBe(7200000)
      expect(slot!.metadata.difficulty).toBe('hard')
      expect(slot!.metadata.completionPercent).toBe(75)
      expect(slot!.storeData.state.level).toBe(5)
      expect(slot!.storeData.state.playerName).toBe('Charlie')
    })

    it('should return undefined for non-existent slot', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      const slot = await store.getSlot('non-existent')
      expect(slot).toBeUndefined()
    })

    it('should check if slot exists', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      expect(await store.hasSlot('slot-1')).toBe(false)

      await store.saveToSlot('slot-1')

      expect(await store.hasSlot('slot-1')).toBe(true)
      expect(await store.hasSlot('non-existent')).toBe(false)
    })

    it('should preserve snapshots when saving and loading slots', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1, score: 0 },
        storage: { backend: MemoryBackend },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level
          },
          setScore: (state, score: number) => {
            state.score = score
          },
        },
      })

      // Create progression with snapshots
      await store.snapshot('start')

      store.commit('setLevel', 2)
      store.commit('setScore', 100)
      await store.snapshot('level-2')

      store.commit('setLevel', 3)
      store.commit('setScore', 250)
      await store.snapshot('level-3')

      // Save the entire progression to a slot
      await store.saveToSlot('progression-slot', {
        name: 'Mid-game Progress',
      })

      // Clear everything and create different state
      await store.reset()
      store.commit('setLevel', 10)
      store.commit('setScore', 1000)

      // Load the slot - should restore all snapshots
      await store.loadFromSlot('progression-slot', { force: true })

      // Verify final state was restored
      expect(store.state.level).toBe(3)
      expect(store.state.score).toBe(250)

      // Verify we can restore to earlier snapshots
      await store.restore('level-2', { force: true })
      expect(store.state.level).toBe(2)
      expect(store.state.score).toBe(100)

      await store.restore('start', { force: true })
      expect(store.state.level).toBe(1)
      expect(store.state.score).toBe(0)
    })

    it('should handle empty metadata gracefully', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
      })

      // Save slot with minimal metadata
      await store.saveToSlot('minimal-slot')

      const slot = await store.getSlot('minimal-slot')
      expect(slot).toBeDefined()
      expect(slot!.slotId).toBe('minimal-slot')
      expect(slot!.name).toBeUndefined()
      expect(slot!.screenshot).toBeUndefined()
      expect(slot!.metadata).toEqual({})
      expect(slot!.timestamp).toBeDefined()
      expect(slot!.timestamp).toBeInstanceOf(Date)
    })

    it('should overwrite existing slots', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        storage: { backend: MemoryBackend },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level
          },
        },
      })

      // Save initial slot
      await store.saveToSlot('reused-slot', { name: 'First Save' })

      let slot = await store.getSlot('reused-slot')
      expect(slot!.name).toBe('First Save')
      expect(slot!.storeData.state.level).toBe(1)

      // Modify state and overwrite slot
      store.commit('setLevel', 5)
      await store.saveToSlot('reused-slot', { name: 'Updated Save' })

      slot = await store.getSlot('reused-slot')
      expect(slot!.name).toBe('Updated Save')
      expect(slot!.storeData.state.level).toBe(5)

      // Should still have only one slot
      const slots = await store.listSlots()
      expect(slots).toHaveLength(1)
    })
  })

  describe('storage Manager Integration', () => {
    it('should work with global storage manager', async () => {
      // Configure global storage
      QuaStoreManager.configureStorage({ backend: MemoryBackend })

      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        // Don't specify storage - use global
      })

      await store.saveToSlot('global-slot', { name: 'Global Save' })

      const slots = await store.listSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0].slotId).toBe('global-slot')
      expect(slots[0].name).toBe('Global Save')
    })

    it('should create default storage manager if none exists', async () => {
      const store = createStore({
        name: 'gameStore',
        state: { level: 1 },
        // No storage configuration at all
      })

      // This should work by creating a default storage manager
      await store.saveToSlot('default-slot')

      const slots = await store.listSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0].slotId).toBe('default-slot')
    })
  })
})
