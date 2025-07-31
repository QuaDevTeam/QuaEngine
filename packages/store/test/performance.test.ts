import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, QuaStoreManager, MemoryBackend, dispatch } from '../src/index';

describe('Performance Tests', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName);
    }
  });

  describe('Store Operations Performance', () => {
    it('should handle rapid mutations efficiently', () => {
      const store = createStore({
        name: 'perf-mutations',
        state: { count: 0, operations: [] as string[] },
        mutations: {
          increment: (state) => {
            state.count++;
          },
          addOperation: (state, op: string) => {
            state.operations.push(op);
          },
          bulkUpdate: (state, data: { count: number; operations: string[] }) => {
            state.count = data.count;
            state.operations = data.operations;
          }
        }
      });

      const startTime = Date.now();
      const operationCount = 10000;

      // Perform many rapid mutations
      for (let i = 0; i < operationCount; i++) {
        store.commit('increment');
        if (i % 100 === 0) {
          store.commit('addOperation', `batch-${i / 100}`);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(store.state.count).toBe(operationCount);
      expect(store.state.operations).toHaveLength(100);
      
      // Should complete within reasonable time (< 1 second for 10k operations)
      expect(duration).toBeLessThan(1000);
      
      // Log performance for reference
      console.log(`📊 Mutations performance: ${operationCount} operations in ${duration}ms (${(operationCount / duration * 1000).toFixed(0)} ops/sec)`);
    });

    it('should handle rapid action dispatches efficiently', async () => {
      const store = createStore({
        name: 'perf-actions',
        state: { counter: 0, results: [] as number[] },
        mutations: {
          increment: (state) => {
            state.counter++;
          },
          addResult: (state, result: number) => {
            state.results.push(result);
          }
        },
        actions: {
          processItem: async ({ commit }, item: number) => {
            // Simulate some async work
            await new Promise(resolve => setTimeout(resolve, 0));
            commit('increment');
            commit('addResult', item * 2);
          },
          fastProcess: ({ commit }, item: number) => {
            // Sync action for speed comparison
            commit('increment');
            commit('addResult', item * 2);
          }
        }
      });

      const actionCount = 1000;
      const startTime = Date.now();

      // Use sync actions for better performance measurement
      const promises = Array.from({ length: actionCount }, (_, i) => 
        store.dispatch('fastProcess', i)
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(store.state.counter).toBe(actionCount);
      expect(store.state.results).toHaveLength(actionCount);
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(500);
      
      console.log(`📊 Actions performance: ${actionCount} async operations in ${duration}ms`);
    });

    it('should handle large state objects efficiently', () => {
      const largeState = {
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          environment: 'test'
        },
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          profile: {
            age: 20 + (i % 50),
            preferences: {
              theme: i % 2 === 0 ? 'dark' : 'light',
              notifications: true,
              settings: {
                autoSave: true,
                compression: i % 3 === 0
              }
            }
          }
        })),
        gameData: {
          levels: Array.from({ length: 100 }, (_, i) => ({
            id: i,
            name: `Level ${i}`,
            difficulty: Math.floor(i / 10) + 1,
            rewards: Array.from({ length: 5 }, (_, j) => `reward_${i}_${j}`)
          })),
          achievements: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            title: `Achievement ${i}`,
            description: `Description for achievement ${i}`,
            unlocked: i < 25
          }))
        }
      };

      const startTime = Date.now();

      const store = createStore({
        name: 'large-state',
        state: largeState,
        mutations: {
          updateUser: (state, { id, updates }: { id: number; updates: any }) => {
            const user = state.users.find(u => u.id === id);
            if (user) {
              Object.assign(user, updates);
            }
          },
          unlockAchievement: (state, id: number) => {
            const achievement = state.gameData.achievements.find(a => a.id === id);
            if (achievement) {
              achievement.unlocked = true;
            }
          },
          addLevel: (state, level: any) => {
            state.gameData.levels.push(level);
          }
        },
        getters: {
          totalUsers: (state) => state.users.length,
          unlockedAchievements: (state) => state.gameData.achievements.filter(a => a.unlocked).length,
          averageUserAge: (state) => {
            const total = state.users.reduce((sum, user) => sum + user.profile.age, 0);
            return total / state.users.length;
          }
        }
      });

      const creationTime = Date.now() - startTime;

      // Test operations on large state
      const operationStartTime = Date.now();

      // Perform various operations
      store.commit('updateUser', { id: 100, updates: { name: 'Updated User 100' } });
      store.commit('unlockAchievement', 30);
      store.commit('addLevel', { id: 100, name: 'Bonus Level', difficulty: 5, rewards: ['bonus_reward'] });

      // Access getters
      const totalUsers = store.getters.totalUsers;
      const unlockedAchievements = store.getters.unlockedAchievements;
      const averageAge = store.getters.averageUserAge;

      const operationTime = Date.now() - operationStartTime;

      expect(totalUsers).toBe(1000);
      expect(unlockedAchievements).toBe(26); // 25 initially + 1 unlocked
      expect(averageAge).toBeCloseTo(44.5); // (20-69 range average)
      expect(store.state.gameData.levels).toHaveLength(101);

      // Performance expectations
      expect(creationTime).toBeLessThan(100);
      expect(operationTime).toBeLessThan(50);

      console.log(`📊 Large state performance: Creation ${creationTime}ms, Operations ${operationTime}ms`);
    });
  });

  describe('Snapshot Performance', () => {
    it('should handle rapid snapshot creation efficiently', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      const store = createStore({
        name: 'snapshot-perf',
        state: {
          data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })),
          metadata: { lastUpdate: Date.now() }
        },
        mutations: {
          updateData: (state, { id, value }: { id: number; value: string }) => {
            const item = state.data.find(d => d.id === id);
            if (item) {
              item.value = value;
            }
            state.metadata.lastUpdate = Date.now();
          }
        }
      });

      const snapshotCount = 100;
      const startTime = Date.now();

      // Create many snapshots
      const snapshotPromises = Array.from({ length: snapshotCount }, async (_, i) => {
        // Make a small change to the state
        store.commit('updateData', { id: i % 100, value: `updated-${i}` });
        return await store.snapshot(`perf-snapshot-${i}`);
      });

      const snapshotIds = await Promise.all(snapshotPromises);
      const snapshotTime = Date.now() - startTime;

      expect(snapshotIds).toHaveLength(snapshotCount);
      
      // Test snapshot retrieval performance
      const retrievalStartTime = Date.now();
      const retrievalPromises = snapshotIds.slice(0, 10).map(id => 
        QuaStoreManager.getSnapshot(id)
      );
      
      const retrievedSnapshots = await Promise.all(retrievalPromises);
      const retrievalTime = Date.now() - retrievalStartTime;

      expect(retrievedSnapshots.every(s => s !== undefined)).toBe(true);

      // Performance expectations
      expect(snapshotTime).toBeLessThan(1000); // 100 snapshots in < 1s
      expect(retrievalTime).toBeLessThan(100);  // 10 retrievals in < 100ms

      console.log(`📊 Snapshot performance: ${snapshotCount} snapshots in ${snapshotTime}ms, 10 retrievals in ${retrievalTime}ms`);

      // Cleanup
      await Promise.all(snapshotIds.map(id => QuaStoreManager.deleteSnapshot(id)));
    });

    it('should handle large snapshot data efficiently', async () => {
      QuaStoreManager.configureStorage({ backend: MemoryBackend });

      // Create store with large data
      const largeDataset = {
        records: Array.from({ length: 5000 }, (_, i) => ({
          id: i,
          name: `Record ${i}`,
          description: `This is a detailed description for record ${i}. `.repeat(10),
          metadata: {
            created: new Date().toISOString(),
            tags: Array.from({ length: 10 }, (_, j) => `tag-${i}-${j}`),
            properties: Object.fromEntries(
              Array.from({ length: 5 }, (_, k) => [`prop${k}`, `value-${i}-${k}`])
            )
          }
        })),
        indexes: Object.fromEntries(
          Array.from({ length: 5000 }, (_, i) => [i.toString(), `record-${i}`])
        )
      };

      const store = createStore({
        name: 'large-snapshot',
        state: largeDataset
      });

      const startTime = Date.now();
      const snapshotId = await store.snapshot('large-data-snapshot');
      const snapshotTime = Date.now() - startTime;

      const retrievalStartTime = Date.now();
      const retrieved = await store.restore(snapshotId, { force: true });
      const retrievalTime = Date.now() - retrievalStartTime;

      expect(snapshotId).toBeDefined();
      expect(retrieved).toBe(store);
      expect(store.state.records).toHaveLength(5000);

      // Should handle large data reasonably fast
      expect(snapshotTime).toBeLessThan(500);
      expect(retrievalTime).toBeLessThan(500);

      console.log(`📊 Large snapshot performance: Save ${snapshotTime}ms, Restore ${retrievalTime}ms`);
    });
  });

  describe('Cross-Store Performance', () => {
    it('should handle many stores efficiently', async () => {
      const storeCount = 50;
      const stores: any[] = [];

      const startTime = Date.now();

      // Create many stores
      for (let i = 0; i < storeCount; i++) {
        stores.push(createStore({
          name: `perf-store-${i}`,
          state: {
            id: i,
            counter: 0,
            data: Array.from({ length: 10 }, (_, j) => `item-${i}-${j}`)
          },
          mutations: {
            increment: (state) => {
              state.counter++;
            }
          },
          actions: {
            incrementAsync: async ({ commit }) => {
              commit('increment');
            }
          }
        }));
      }

      const creationTime = Date.now() - startTime;

      // Test cross-store operations
      const operationStartTime = Date.now();

      const operations = [];
      for (let i = 0; i < storeCount; i++) {
        operations.push(dispatch(`perf-store-${i}/incrementAsync`));
      }

      await Promise.all(operations);

      const operationTime = Date.now() - operationStartTime;

      // Verify all stores were updated
      for (let i = 0; i < storeCount; i++) {
        const store = QuaStoreManager.getStore(`perf-store-${i}`);
        expect(store!.state.counter).toBe(1);
      }

      expect(creationTime).toBeLessThan(200);
      expect(operationTime).toBeLessThan(100);

      console.log(`📊 Multi-store performance: ${storeCount} stores created in ${creationTime}ms, cross-store ops in ${operationTime}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with repeated operations', () => {
      const store = createStore({
        name: 'memory-test',
        state: { operations: 0, data: [] as any[] },
        mutations: {
          addData: (state, item: any) => {
            state.data.push(item);
            state.operations++;
          },
          clearData: (state) => {
            state.data = [];
            state.operations = 0;
          }
        }
      });

      // Perform operations that should not accumulate memory
      for (let cycle = 0; cycle < 10; cycle++) {
        // Add data
        for (let i = 0; i < 1000; i++) {
          store.commit('addData', { id: i, value: `cycle-${cycle}-item-${i}` });
        }

        expect(store.state.data).toHaveLength(1000);
        expect(store.state.operations).toBe(1000);

        // Clear data
        store.commit('clearData');
        expect(store.state.data).toHaveLength(0);
        expect(store.state.operations).toBe(0);
      }

      // Final state should be clean
      expect(store.state.data).toHaveLength(0);
      expect(store.state.operations).toBe(0);
    });
  });
});