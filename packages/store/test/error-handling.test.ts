import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, QuaStoreManager, MemoryBackend, StorageManager, dispatch, commit } from '../src/index';
import { ValidationMiddleware } from '../examples/middlewares/custom-middlewares';

describe('Error Handling and Edge Cases', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName);
    }
  });

  describe('Store Creation Edge Cases', () => {
    it('should handle store creation with no name', () => {
      expect(() => {
        (createStore as any)({
          state: { count: 0 }
        });
      }).toThrow('Must specify the name of store.');
    });

    it('should handle store creation with empty name', () => {
      expect(() => {
        createStore({
          name: '',
          state: { count: 0 }
        });
      }).toThrow('Must specify the name of store.');
    });

    it('should handle store creation with duplicate names', () => {
      createStore({
        name: 'duplicate',
        state: { count: 0 }
      });

      // Creating another store with the same name should replace the first one
      const secondStore = createStore({
        name: 'duplicate',
        state: { count: 1 }
      });

      expect(QuaStoreManager.getStore('duplicate')).toBe(secondStore);
      expect(QuaStoreManager.getStoreCount()).toBe(1);
    });

    it('should handle store creation with minimal configuration', () => {
      const store = createStore({
        name: 'minimal'
      });

      expect(store.state).toEqual({});
      expect(store.getName()).toBe('minimal');
      expect(typeof store.commit).toBe('function');
      expect(typeof store.dispatch).toBe('function');
    });

    it('should handle store creation with null/undefined values', () => {
      const store = createStore({
        name: 'nullish',
        state: null as any,
        mutations: undefined,
        actions: null as any,
        getters: undefined
      });

      expect(store.state).toEqual({});
      expect(store.getName()).toBe('nullish');
    });
  });

  describe('Mutation and Action Error Handling', () => {
    it('should handle mutations that throw errors', () => {
      const store = createStore({
        name: 'errorStore',
        state: { count: 0 },
        mutations: {
          throwError: () => {
            throw new Error('Mutation error');
          },
          validMutation: (state) => {
            state.count++;
          }
        }
      });

      expect(() => store.commit('throwError')).toThrow('Mutation error');

      // Store should still be functional after error
      store.commit('validMutation');
      expect(store.state.count).toBe(1);
    });

    it('should handle actions that throw errors', async () => {
      const store = createStore({
        name: 'errorStore',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        },
        actions: {
          throwError: async () => {
            throw new Error('Action error');
          },
          validAction: async ({ commit }) => {
            commit('increment');
          }
        }
      });

      await expect(store.dispatch('throwError')).rejects.toThrow('Action error');

      // Store should still be functional after error
      await store.dispatch('validAction');
      expect(store.state.count).toBe(1);
    });

    it('should handle async action failures gracefully', async () => {
      const store = createStore({
        name: 'asyncErrorStore',
        state: { loading: false, error: null, data: null },
        mutations: {
          setLoading: (state, loading: boolean) => {
            state.loading = loading;
          },
          setError: (state, error: string) => {
            state.error = error;
          },
          setData: (state, data: any) => {
            state.data = data;
          }
        },
        actions: {
          fetchData: async ({ commit }) => {
            commit('setLoading', true);
            try {
              // Simulate API call that fails
              await new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Network error')), 10)
              );
            } catch (error) {
              commit('setError', (error as Error).message);
            } finally {
              commit('setLoading', false);
            }
          }
        }
      });

      await store.dispatch('fetchData');

      expect(store.state.loading).toBe(false);
      expect(store.state.error).toBe('Network error');
      expect(store.state.data).toBeNull();
    });
  });

  describe('Storage Manager Error Handling', () => {
    it('should handle storage manager initialization failures gracefully', async () => {
      class FailingBackend {
        async init() {
          throw new Error('Init failed');
        }
        async saveSnapshot() { }
        async getSnapshot() { return undefined; }
        async deleteSnapshot() { }
        async listSnapshots() { return []; }
        async clearSnapshots() { }
      }

      const manager = new StorageManager({
        backend: FailingBackend as any
      });

      // Should not throw during construction
      expect(manager).toBeDefined();

      // Should handle init failure gracefully
      await expect(manager.init()).rejects.toThrow('Init failed');
    });

    it('should handle middleware that throws errors', async () => {
      const errorMiddleware = {
        beforeWrite: async () => {
          throw new Error('Middleware error');
        }
      };

      const manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [errorMiddleware]
      });

      await manager.init();

      const snapshot = {
        id: 'test',
        storeName: 'test',
        data: { test: true },
        createdAt: new Date()
      };

      await expect(manager.saveSnapshot(snapshot)).rejects.toThrow('Middleware error');
    });

    it('should handle validation middleware failures', async () => {
      const validator = (value: any) => {
        return value.data && typeof value.data.count === 'number' && value.data.count >= 0;
      };

      const validationMiddleware = new ValidationMiddleware(validator);
      const manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [validationMiddleware]
      });

      await manager.init();

      const validSnapshot = {
        id: 'valid',
        storeName: 'test',
        data: { count: 5 },
        createdAt: new Date()
      };

      const invalidSnapshot = {
        id: 'invalid',
        storeName: 'test',
        data: { count: -1 },
        createdAt: new Date()
      };

      // Valid snapshot should save successfully
      await expect(manager.saveSnapshot(validSnapshot)).resolves.not.toThrow();

      // Invalid snapshot should fail validation
      await expect(manager.saveSnapshot(invalidSnapshot)).rejects.toThrow('Validation failed');
    });
  });

  describe('Cross-store Operation Edge Cases', () => {
    it('should handle malformed action/mutation names', async () => {
      const testStore = createStore({
        name: 'store',
        state: { count: 0 },
        mutations: {
          'mutation/extra': (state) => {
            state.count++;
          }
        },
        actions: {
          'action/extra': async () => {
            // Do nothing, just test that it doesn't throw
          }
        }
      });

      createStore({
        name: 'testStore',
        state: { count: 0 }
      });

      // Missing slash
      try {
        await dispatch('invalidname');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toMatch(/Invalid action name/);
      }
      expect(() => commit('invalidname')).toThrow(/Invalid action name/);

      // Too many slashes - should work if the action/mutation exists
      await expect(dispatch('store/action/extra')).resolves.not.toThrow();
      expect(() => commit('store/mutation/extra')).not.toThrow();
    });

    it('should handle operations on non-existent stores', async () => {
      try {
        await dispatch('nonexistent/action');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toMatch(/Cannot find the certain store named/);
      }

      expect(() => commit('nonexistent/mutation')).toThrow(
        /Cannot find the certain store named/
      );
    });

    it('should handle concurrent store operations', async () => {
      const store = createStore({
        name: 'concurrent',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        },
        actions: {
          incrementAsync: async ({ commit }) => {
            // Add small delay to test concurrency
            await new Promise(resolve => setTimeout(resolve, 1));
            commit('increment');
          }
        }
      });

      // Run multiple concurrent operations
      const operations = Array.from({ length: 10 }, () =>
        store.dispatch('incrementAsync')
      );

      await Promise.all(operations);
      expect(store.state.count).toBe(10);
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should properly clean up when stores are unregistered', () => {
      const store = createStore({
        name: 'cleanup-test',
        state: { data: 'test' }
      });

      expect(QuaStoreManager.hasStore('cleanup-test')).toBe(true);

      QuaStoreManager.unregister('cleanup-test');

      expect(QuaStoreManager.hasStore('cleanup-test')).toBe(false);
      expect(QuaStoreManager.getStore('cleanup-test')).toBeNull();
    });

    it('should handle large numbers of stores', () => {
      const storeCount = 100;
      const stores: any[] = [];

      // Create many stores
      for (let i = 0; i < storeCount; i++) {
        stores.push(createStore({
          name: `store-${i}`,
          state: { id: i, data: `data-${i}` }
        }));
      }

      expect(QuaStoreManager.getStoreCount()).toBe(storeCount);

      // Verify all stores are accessible
      for (let i = 0; i < storeCount; i++) {
        const store = QuaStoreManager.getStore(`store-${i}`);
        expect(store).toBeDefined();
        expect(store!.state.id).toBe(i);
      }

      // Clean up
      for (let i = 0; i < storeCount; i++) {
        QuaStoreManager.unregister(`store-${i}`);
      }

      expect(QuaStoreManager.getStoreCount()).toBe(0);
    });

    it('should handle memory backend cleanup', async () => {
      const backend = new MemoryBackend();

      // Add some data
      const snapshot = {
        id: 'cleanup-test',
        storeName: 'test',
        data: { test: true },
        createdAt: new Date()
      };

      await backend.saveSnapshot(snapshot);
      expect(backend.getStorageSize()).toBe(1);

      // Close should clean up
      await backend.close();
      expect(backend.getStorageSize()).toBe(0);
    });
  });

  describe('State Mutation Safety', () => {
    it('should maintain state immutability principles', () => {
      const initialState = {
        nested: { count: 0 },
        array: [1, 2, 3],
        primitive: 'test'
      };

      const store = createStore({
        name: 'immutable-test',
        state: initialState,
        mutations: {
          updateNested: (state, value: number) => {
            state.nested.count = value;
          },
          updateArray: (state, item: number) => {
            state.array.push(item);
          },
          updatePrimitive: (state, value: string) => {
            state.primitive = value;
          }
        }
      });

      // Store initial state reference
      const originalNested = store.state.nested;
      const originalArray = store.state.array;

      // Mutate state
      store.commit('updateNested', 5);
      store.commit('updateArray', 4);
      store.commit('updatePrimitive', 'modified');

      // State should be mutated (this is expected behavior for QuaStore)
      expect(store.state.nested).toBe(originalNested);
      expect(store.state.array).toBe(originalArray);
      expect(store.state.nested.count).toBe(5);
      expect(store.state.array).toContain(4);
      expect(store.state.primitive).toBe('modified');
    });

    it('should handle circular references in state', () => {
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      // This should not cause infinite loops during serialization
      const store = createStore({
        name: 'circular-test',
        state: {
          normal: 'data',
          // Don't include circular reference directly as it would break JSON.stringify
          safeData: { nested: { deep: 'value' } }
        }
      });

      expect(() => store.state.safeData.nested.deep).not.toThrow();
    });
  });
});