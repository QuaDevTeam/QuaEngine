import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, dispatch, commit, createStore, QuaStoreManager } from '../src/index';

describe('Cross-Store Operations', () => {
  beforeEach(() => {
    // Clear all stores before each test
    for (const storeName of QuaStoreManager.listStores()) {
      QuaStoreManager.unregister(storeName);
    }
  });

  describe('useStore function', () => {
    it('should retrieve existing store', () => {
      const store = createStore({
        name: 'testStore',
        state: { count: 0 }
      });

      const retrieved = useStore('testStore');
      expect(retrieved).toBe(store);
    });

    it('should return null for non-existent store', () => {
      const retrieved = useStore('nonExistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Cross-store dispatch', () => {
    it('should dispatch actions across stores', async () => {
      const userStore = createStore({
        name: 'user',
        state: { name: '', loggedIn: false },
        mutations: {
          setName: (state, name: string) => {
            state.name = name;
          },
          setLoggedIn: (state, status: boolean) => {
            state.loggedIn = status;
          }
        },
        actions: {
          login: async ({ commit }, name: string) => {
            commit('setName', name);
            commit('setLoggedIn', true);
          }
        }
      });

      const gameStore = createStore({
        name: 'game',
        state: { level: 1, score: 0 },
        mutations: {
          setLevel: (state, level: number) => {
            state.level = level;
          },
          addScore: (state, points: number) => {
            state.score += points;
          }
        },
        actions: {
          levelUp: async ({ commit }) => {
            const currentLevel = gameStore.state.level;
            commit('setLevel', currentLevel + 1);
            commit('addScore', 100);
          }
        }
      });

      // Use cross-store dispatch
      await dispatch('user/login', 'Alice');
      expect(userStore.state.name).toBe('Alice');
      expect(userStore.state.loggedIn).toBe(true);

      await dispatch('game/levelUp');
      expect(gameStore.state.level).toBe(2);
      expect(gameStore.state.score).toBe(100);
    });

    it('should throw error for non-existent store in dispatch', async () => {
      try {
        await dispatch('nonExistent/action');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toMatch(/Cannot find the certain store named/);
      }
    });

    it('should throw error for invalid action format in dispatch', async () => {
      try {
        await dispatch('invalidformat');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toMatch(/Invalid action name/);
      }
    });
  });

  describe('Cross-store commit', () => {
    it('should commit mutations across stores', () => {
      const store1 = createStore({
        name: 'store1',
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

      const store2 = createStore({
        name: 'store2',
        state: { value: 'initial' },
        mutations: {
          setValue: (state, value: string) => {
            state.value = value;
          }
        }
      });

      // Use cross-store commit
      commit('store1/increment');
      expect(store1.state.count).toBe(1);

      commit('store1/add', 5);
      expect(store1.state.count).toBe(6);

      commit('store2/setValue', 'modified');
      expect(store2.state.value).toBe('modified');
    });

    it('should throw error for non-existent store in commit', () => {
      expect(() => commit('nonExistent/mutation')).toThrow(
        /Cannot find the certain store named/
      );
    });

    it('should throw error for invalid mutation format in commit', () => {
      expect(() => commit('invalidformat')).toThrow(
        /Invalid action name/
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex cross-store workflows', async () => {
      const authStore = createStore({
        name: 'auth',
        state: { 
          user: null as { id: number; name: string } | null,
          token: null as string | null
        },
        mutations: {
          setUser: (state, user: { id: number; name: string }) => {
            state.user = user;
          },
          setToken: (state, token: string) => {
            state.token = token;
          },
          logout: (state) => {
            state.user = null;
            state.token = null;
          }
        },
        actions: {
          login: async ({ commit: localCommit }, { username, password }: { username: string; password: string }) => {
            // Simulate API call
            const user = { id: 1, name: username };
            const token = 'fake-jwt-token';
            
            localCommit('setUser', user);
            localCommit('setToken', token);
            
            // Notify other stores about login
            await dispatch('game/initializeUserData', user.id);
            // Use imported global commit for cross-store operations
            commit('ui/setNotification', 'Login successful!');
          }
        }
      });

      const gameStore = createStore({
        name: 'game',
        state: {
          playerStats: null as { userId: number; level: number; experience: number } | null,
          currentScene: 'menu'
        },
        mutations: {
          setPlayerStats: (state, stats: { userId: number; level: number; experience: number }) => {
            state.playerStats = stats;
          },
          setCurrentScene: (state, scene: string) => {
            state.currentScene = scene;
          }
        },
        actions: {
          initializeUserData: async ({ commit }, userId: number) => {
            // Simulate loading user game data
            const stats = { userId, level: 1, experience: 0 };
            commit('setPlayerStats', stats);
            commit('setCurrentScene', 'game');
          }
        }
      });

      const uiStore = createStore({
        name: 'ui',
        state: {
          notification: null as string | null,
          loading: false
        },
        mutations: {
          setNotification: (state, message: string) => {
            state.notification = message;
          },
          setLoading: (state, loading: boolean) => {
            state.loading = loading;
          }
        }
      });

      // Execute the complex workflow
      await dispatch('auth/login', { username: 'testuser', password: 'password' });

      // Verify all stores were updated correctly
      expect(authStore.state.user).toEqual({ id: 1, name: 'testuser' });
      expect(authStore.state.token).toBe('fake-jwt-token');
      
      expect(gameStore.state.playerStats).toEqual({ userId: 1, level: 1, experience: 0 });
      expect(gameStore.state.currentScene).toBe('game');
      
      expect(uiStore.state.notification).toBe('Login successful!');
    });

    it('should maintain store isolation despite cross-store operations', () => {
      const store1 = createStore({
        name: 'isolated1',
        state: { privateData: 'secret1' },
        mutations: {
          updatePrivate: (state, data: string) => {
            state.privateData = data;
          }
        }
      });

      const store2 = createStore({
        name: 'isolated2',
        state: { privateData: 'secret2' },
        mutations: {
          updatePrivate: (state, data: string) => {
            state.privateData = data;
          }
        }
      });

      // Modify each store independently
      commit('isolated1/updatePrivate', 'modified1');
      commit('isolated2/updatePrivate', 'modified2');

      // Verify isolation
      expect(store1.state.privateData).toBe('modified1');
      expect(store2.state.privateData).toBe('modified2');

      // Verify stores can't access each other's state directly
      expect(store1.state).not.toHaveProperty('isolated2');
      expect(store2.state).not.toHaveProperty('isolated1');
    });
  });
});