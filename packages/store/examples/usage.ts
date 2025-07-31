import { createStore, configureStorage, EncryptionMiddleware } from '@quaengine/store';
import { MemoryBackend } from './backends/custom-backends';

// Example 1: Basic store creation with default IndexedDB backend
const basicStore = createStore({
  name: 'gameState',
  state: {
    playerName: '',
    level: 1,
    score: 0
  },
  mutations: {
    setPlayerName: (state, name: string) => {
      state.playerName = name;
    },
    levelUp: (state) => {
      state.level += 1;
    },
    addScore: (state, points: number) => {
      state.score += points;
    }
  },
  actions: {
    async startNewGame({ commit }, playerName: string) {
      commit('setPlayerName', playerName);
      commit('levelUp'); // Start at level 1
      commit('addScore', 0); // Reset score
    }
  }
});

// Example 2: Store with custom storage backend (Memory)
const tempStore = createStore({
  name: 'tempData',
  state: {
    currentDialog: null,
    tempFlags: {}
  },
  storage: {
    backend: MemoryBackend // Data will be lost when app closes
  },
  mutations: {
    setDialog: (state, dialog) => {
      state.currentDialog = dialog;
    },
    setFlag: (state, { key, value }) => {
      state.tempFlags[key] = value;
    }
  }
});

// Example 3: Store with middleware for encryption
const secureStore = createStore({
  name: 'sensitiveData',
  state: {
    userPreferences: {},
    achievements: []
  },
  storage: {
    middlewares: [
      new EncryptionMiddleware('my-secret-key')
    ]
  },
  mutations: {
    setPreference: (state, { key, value }) => {
      state.userPreferences[key] = value;
    },
    addAchievement: (state, achievement) => {
      state.achievements.push(achievement);
    }
  }
});

// Example 4: Global storage configuration
configureStorage({
  backend: {
    driver: MemoryBackend,
    options: { /* backend options */ }
  },
  middlewares: [
    new EncryptionMiddleware('global-key')
  ]
});

// Example 5: Using the store
async function gameExample() {
  // Commit mutations
  basicStore.commit('setPlayerName', 'Alice');
  basicStore.commit('addScore', 100);

  // Dispatch actions
  await basicStore.dispatch('startNewGame', 'Bob');

  // Access state through getters (if defined)
  console.log('Current state:', basicStore.state);

  // Create snapshot
  const snapshotId = await basicStore.snapshot('save-game-1');
  console.log('Snapshot created:', snapshotId);

  // Later, restore from snapshot
  await basicStore.restore(snapshotId);
}

export { basicStore, tempStore, secureStore, gameExample };