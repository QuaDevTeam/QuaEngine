import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, QuaStoreManager, MemoryBackend } from '../src/index';

describe('Snapshot System', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName);
    }
  });

  describe('Individual Store Snapshots', () => {
    it('should create and restore snapshots', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0, name: 'initial' },
        storage: { backend: MemoryBackend }, // Use memory backend for testing
        mutations: {
          increment: (state) => {
            state.count++;
          },
          setName: (state, name: string) => {
            state.name = name;
          }
        }
      });

      // Modify state
      store.commit('increment');
      store.commit('setName', 'modified');
      expect(store.state.count).toBe(1);
      expect(store.state.name).toBe('modified');

      // Create snapshot
      const snapshotId = await store.snapshot('test-snapshot');
      expect(snapshotId).toBe('test-snapshot');

      // Modify state further
      store.commit('increment');
      store.commit('setName', 'further-modified');
      expect(store.state.count).toBe(2);
      expect(store.state.name).toBe('further-modified');

      // Restore snapshot with force option since there's existing data
      await store.restore(snapshotId, { force: true });
      expect(store.state.count).toBe(1);
      expect(store.state.name).toBe('modified');
    });

    it('should generate automatic snapshot IDs', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend }
      });

      const snapshotId = await store.snapshot();
      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
      expect(snapshotId.length).toBeGreaterThan(0);
    });

    it('should throw error when restoring with existing data without force', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      store.commit('increment');
      const snapshotId = await store.snapshot();

      store.commit('increment');
      expect(store.state.count).toBe(2);

      await expect(store.restore(snapshotId)).rejects.toThrow(
        'Cannot restore snapshot due to some data already exists in store. Use force option to override.'
      );
    });

    it('should restore with force option', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      store.commit('increment');
      const snapshotId = await store.snapshot();

      store.commit('increment');
      expect(store.state.count).toBe(2);

      await store.restore(snapshotId, { force: true });
      expect(store.state.count).toBe(1);
    });

    it('should throw error for non-existent snapshot', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        storage: { backend: MemoryBackend }
      });

      await expect(store.restore('non-existent')).rejects.toThrow(
        'Snapshot with id "non-existent" not found.'
      );
    });

    it('should throw error when restoring snapshot from different store', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store1 = createStore({
        name: 'store1',
        state: { count: 1 }
        // Don't specify storage - let it use global storage
      });

      const store2 = createStore({
        name: 'store2',
        state: { count: 2 }
        // Don't specify storage - let it use global storage
      });

      // Use manager snapshot so both stores can see it
      const snapshotId = await QuaStoreManager.snapshot('store1');

      await expect(store2.restore(snapshotId)).rejects.toThrow(
        'Snapshot belongs to store "store1", not "store2".'
      );
    });
  });

  describe('Global Snapshots (QuaStoreManager)', () => {
    it('should create and restore global snapshots', async () => {
      // Configure global storage to use memory backend for testing
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store1 = createStore({
        name: 'store1',
        state: { count: 1 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      const store2 = createStore({
        name: 'store2',  
        state: { value: 'a' },
        mutations: {
          setValue: (state, value: string) => {
            state.value = value;
          }
        }
      });

      // Modify both stores
      store1.commit('increment');
      store2.commit('setValue', 'b');
      expect(store1.state.count).toBe(2);
      expect(store2.state.value).toBe('b');

      // Create global snapshot
      const snapshotId = await QuaStoreManager.snapshotAll('global-test');
      expect(snapshotId).toBe('global-test');

      // Modify stores further
      store1.commit('increment');
      store2.commit('setValue', 'c');
      expect(store1.state.count).toBe(3);
      expect(store2.state.value).toBe('c');

      // Restore global snapshot
      await QuaStoreManager.restoreAll(snapshotId, { force: true });
      expect(store1.state.count).toBe(2);
      expect(store2.state.value).toBe('b');
    });

    it('should handle individual store snapshots through manager', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      store.commit('increment');
      const snapshotId = await QuaStoreManager.snapshot('testStore', 'manager-test');
      
      store.commit('increment');
      expect(store.state.count).toBe(2);

      await QuaStoreManager.restoreStore('testStore', snapshotId, { force: true });
      expect(store.state.count).toBe(1);
    });

    it('should list snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store = createStore({
        name: 'testStore',
        state: { count: 0 }
        // Don't specify storage - let it use global storage
      });

      await QuaStoreManager.snapshot('testStore', 'snap-1');
      await QuaStoreManager.snapshot('testStore', 'snap-2');

      const snapshots = await QuaStoreManager.listSnapshots('testStore');
      expect(snapshots).toHaveLength(2);
      expect(snapshots.map(s => s.id)).toContain('snap-1');
      expect(snapshots.map(s => s.id)).toContain('snap-2');

      const allSnapshots = await QuaStoreManager.listSnapshots();
      expect(allSnapshots.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store = createStore({
        name: 'testStore',
        state: { count: 0 }
        // Don't specify storage - let it use global storage
      });

      await QuaStoreManager.snapshot('testStore', 'to-delete');
      
      let snapshots = await QuaStoreManager.listSnapshots('testStore');
      expect(snapshots.some(s => s.id === 'to-delete')).toBe(true);

      await QuaStoreManager.deleteSnapshot('to-delete');
      
      snapshots = await QuaStoreManager.listSnapshots('testStore');
      expect(snapshots.some(s => s.id === 'to-delete')).toBe(false);
    });

    it('should clear snapshots', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store1 = createStore({
        name: 'store1',
        state: { count: 0 }
        // Don't specify storage - let it use global storage
      });

      const store2 = createStore({
        name: 'store2',
        state: { count: 0 }
        // Don't specify storage - let it use global storage
      });

      await QuaStoreManager.snapshot('store1', 'snap-1');
      await QuaStoreManager.snapshot('store2', 'snap-2');

      // Clear snapshots for specific store
      await QuaStoreManager.clearSnapshots('store1');
      
      const store1Snapshots = await QuaStoreManager.listSnapshots('store1');
      const store2Snapshots = await QuaStoreManager.listSnapshots('store2');
      
      expect(store1Snapshots).toHaveLength(0);
      expect(store2Snapshots).toHaveLength(1);

      // Clear all snapshots
      await QuaStoreManager.clearAllSnapshots();
      
      const allSnapshots = await QuaStoreManager.listSnapshots();
      expect(allSnapshots).toHaveLength(0);
    });

    it('should throw error when restoring non-existent global snapshot', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      await expect(QuaStoreManager.restoreAll('non-existent')).rejects.toThrow(
        'Snapshot with id "non-existent" not found.'
      );
    });

    it('should throw error when restoring individual snapshot as global', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store = createStore({
        name: 'testStore',
        state: { count: 0 }
        // Don't specify storage - let it use global storage
      });

      const snapshotId = await QuaStoreManager.snapshot('testStore', 'individual');

      await expect(QuaStoreManager.restoreAll(snapshotId)).rejects.toThrow(
        `Snapshot "${snapshotId}" is not a global snapshot.`
      );
    });
  });
});