import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, QuaStoreManager, MemoryBackend } from '../src/index';

describe('QuaStore Core', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName);
    }
  });

  describe('Store Creation and Basic Operations', () => {
    it('should create a store with initial state', () => {
      const store = createStore({
        name: 'testStore',
        state: {
          count: 0,
          name: 'test'
        }
      });

      expect(store.state.count).toBe(0);
      expect(store.state.name).toBe('test');
      expect(store.getName()).toBe('testStore');
    });

    it('should commit mutations', () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          },
          add: (state, value: number) => {
            state.count += value;
          }
        }
      });

      store.commit('increment');
      expect(store.state.count).toBe(1);

      store.commit('add', 5);
      expect(store.state.count).toBe(6);
    });

    it('should throw error for non-existent mutation', () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        mutations: {}
      });

      expect(() => store.commit('nonExistent')).toThrow('No matched mutation found.');
    });

    it('should dispatch actions', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        },
        actions: {
          incrementAsync: async ({ commit }) => {
            commit('increment');
          },
          addAsync: async ({ commit }, value: number) => {
            commit('add', value);
          }
        }
      });

      // Add the add mutation for the action test
      store.mutations.add = (state, value: number) => {
        state.count += value;
      };

      await store.dispatch('incrementAsync');
      expect(store.state.count).toBe(1);

      await store.dispatch('addAsync', 10);
      expect(store.state.count).toBe(11);
    });

    it('should throw error for non-existent action', async () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        actions: {}
      });

      await expect(store.dispatch('nonExistent')).rejects.toThrow('No matched action found.');
    });

    it('should work with getters', () => {
      const store = createStore({
        name: 'testStore',
        state: { 
          firstName: 'John', 
          lastName: 'Doe',
          count: 5
        },
        getters: {
          fullName: (state) => `${state.firstName} ${state.lastName}`,
          doubleCount: (state) => state.count * 2
        }
      });

      expect(store.getters.fullName).toBe('John Doe');
      expect(store.getters.doubleCount).toBe(10);
    });

    it('should throw error for invalid getter', () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 },
        getters: {
          validGetter: (state) => state.count
        }
      });

      // Manually set an invalid getter to test error handling
      (store as any).innerGetters.invalidGetter = 'not a function';

      expect(() => store.getters.invalidGetter).toThrow('Invalid getter in store [testStore]');
    });

    it('should reset store to initial state', () => {
      const initialState = { count: 0, name: 'initial' };
      const store = createStore({
        name: 'testStore',
        state: initialState,
        mutations: {
          increment: (state) => {
            state.count++;
          },
          changeName: (state, name: string) => {
            state.name = name;
          }
        }
      });

      store.commit('increment');
      store.commit('changeName', 'changed');
      expect(store.state.count).toBe(1);
      expect(store.state.name).toBe('changed');

      store.reset();
      expect(store.state.count).toBe(0);
      expect(store.state.name).toBe('initial');
    });
  });

  describe('Store Manager', () => {
    it('should register and retrieve stores', () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 }
      });

      expect(QuaStoreManager.hasStore('testStore')).toBe(true);
      expect(QuaStoreManager.getStore('testStore')).toBe(store);
      expect(QuaStoreManager.listStores()).toContain('testStore');
      expect(QuaStoreManager.getStoreCount()).toBe(1);
    });

    it('should unregister stores', () => {
      createStore({
        name: 'testStore',
        state: { count: 0 }
      });

      expect(QuaStoreManager.hasStore('testStore')).toBe(true);
      
      QuaStoreManager.unregister('testStore');
      expect(QuaStoreManager.hasStore('testStore')).toBe(false);
      expect(QuaStoreManager.getStoreCount()).toBe(0);
    });

    it('should throw error when registering store with existing name', () => {
      createStore({
        name: 'testStore',
        state: { count: 0 }
      });

      const newStore = new (QuaStoreManager as any).constructor.stores.testStore.constructor('testStore', { state: { count: 1 } });
      
      expect(() => QuaStoreManager.register('testStore', newStore)).toThrow('The name has already been existed.');
    });

    it('should throw error when unregistering non-existent store', () => {
      expect(() => QuaStoreManager.unregister('nonExistent')).toThrow('Cannot find the certain store named "nonExistent".');
    });

    it('should reset all stores', () => {
      const store1 = createStore({
        name: 'store1',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      const store2 = createStore({
        name: 'store2',
        state: { value: 'initial' },
        mutations: {
          change: (state, value: string) => {
            state.value = value;
          }
        }
      });

      store1.commit('increment');
      store2.commit('change', 'modified');

      expect(store1.state.count).toBe(1);
      expect(store2.state.value).toBe('modified');

      QuaStoreManager.resetAllStores();

      expect(store1.state.count).toBe(0);
      expect(store2.state.value).toBe('initial');
    });

    it('should reset specific store', () => {
      const store1 = createStore({
        name: 'store1',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      const store2 = createStore({
        name: 'store2',
        state: { count: 0 },
        mutations: {
          increment: (state) => {
            state.count++;
          }
        }
      });

      store1.commit('increment');
      store2.commit('increment');

      expect(store1.state.count).toBe(1);
      expect(store2.state.count).toBe(1);

      QuaStoreManager.resetStore('store1');

      expect(store1.state.count).toBe(0);
      expect(store2.state.count).toBe(1);
    });
  });
});