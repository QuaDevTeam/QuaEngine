# @quaengine/store

A flexible, TypeScript-first state management library with pluggable storage backends and middleware support.

## Features

- **Redux-like Architecture**: Familiar state management patterns with state, mutations, actions, and getters
- **Pluggable Storage Backends**: Swap between IndexedDB, LocalStorage, Memory, or create custom backends
- **Middleware System**: Add encryption, compression, logging, validation, and more
- **Snapshot System**: Save and restore complete application state
- **TypeScript-First**: Full type safety and excellent IDE support
- **Multiple Store Management**: Create and manage multiple stores with ease
- **Universal**: Works in both browser and Node.js environments (backend-dependent)

## Installation

```bash
npm install @quaengine/store
# or
pnpm add @quaengine/store
```

## Quick Start

### Basic Store Creation

```typescript
import { createStore } from '@quaengine/store'

const gameStore = createStore({
  name: 'gameState',
  state: {
    playerName: '',
    level: 1,
    score: 0
  },
  mutations: {
    setPlayerName: (state, name: string) => {
      state.playerName = name
    },
    levelUp: (state) => {
      state.level += 1
    },
    addScore: (state, points: number) => {
      state.score += points
    }
  },
  actions: {
    async startNewGame({ commit }, playerName: string) {
      commit('setPlayerName', playerName)
      commit('levelUp')
      // Async operations like API calls can go here
    }
  },
  getters: {
    playerInfo: state => `${state.playerName} - Level ${state.level}`,
    isHighScore: state => state.score > 10000
  }
})

// Use the store
gameStore.commit('setPlayerName', 'Alice')
await gameStore.dispatch('startNewGame', 'Bob')
console.log(gameStore.getters.playerInfo) // "Bob - Level 1"
```

## Storage Backends

### Default IndexedDB Backend

By default, all stores use IndexedDB for persistence. No configuration needed:

```typescript
const store = createStore({
  name: 'myStore',
  state: { data: 'persisted automatically' }
})
```

### Custom Storage Backend

You can specify a different storage backend:

```typescript
import { createStore, LocalStorageBackend, MemoryBackend } from '@quaengine/store'

// Use memory storage (data lost on app close)
const tempStore = createStore({
  name: 'tempStore',
  state: { temp: 'data' },
  storage: {
    backend: MemoryBackend
  }
})

// Use LocalStorage
const localStore = createStore({
  name: 'localStore',
  state: { persistent: 'data' },
  storage: {
    backend: LocalStorageBackend
  }
})

// Custom backend with options
const customStore = createStore({
  name: 'customStore',
  state: { data: 'value' },
  storage: {
    backend: {
      driver: LocalStorageBackend,
      options: { prefix: 'myapp_' }
    }
  }
})
```

### Creating Custom Backends

Implement the `StorageBackend` interface:

```typescript
import { QSSnapshot, QSSnapshotMeta, StorageBackend } from '@quaengine/store'

class FileSystemBackend implements StorageBackend {
  constructor(private basePath: string) {}

  async saveSnapshot(snapshot: QSSnapshot): Promise<void> {
    // Implement file system storage
  }

  async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    // Implement file system retrieval
  }

  // ... implement other required methods
}
```

## Middleware System

Middleware allows you to intercept and modify data during storage operations:

### Built-in Middleware Examples

```typescript
import {
  CompressionMiddleware,
  createStore,
  EncryptionMiddleware,
  LoggingMiddleware
} from '@quaengine/store'

const secureStore = createStore({
  name: 'secureStore',
  state: { sensitiveData: 'secret' },
  storage: {
    middlewares: [
      new EncryptionMiddleware('my-secret-key'),
      new CompressionMiddleware(),
      new LoggingMiddleware(console.log)
    ]
  }
})
```

### Custom Middleware

```typescript
import { StorageMiddleware } from '@quaengine/store'

class TimestampMiddleware implements StorageMiddleware {
  async beforeWrite(key: string, value: any): Promise<any> {
    return {
      ...value,
      _timestamp: Date.now()
    }
  }

  async afterRead(key: string, value: any): Promise<any> {
    console.log(`Data was stored at: ${new Date(value._timestamp)}`)
    return value
  }
}
```

## Snapshot System

Save and restore complete application state:

```typescript
// Create a snapshot
// Global snapshots (all stores)
import { QuaStoreManager } from '@quaengine/store'

const snapshotId = await store.snapshot('save-point-1')

// Restore from snapshot
await store.restore(snapshotId)

const globalSnapshotId = await QuaStoreManager.snapshotAll('checkpoint-1')
await QuaStoreManager.restoreAll(globalSnapshotId)

// List all snapshots
const snapshots = await QuaStoreManager.listSnapshots()
```

## Global Configuration

Configure storage settings globally:

```typescript
import { configureStorage, EncryptionMiddleware } from '@quaengine/store'

configureStorage({
  backend: {
    driver: LocalStorageBackend,
    options: { prefix: 'myapp_' }
  },
  middlewares: [
    new EncryptionMiddleware('global-encryption-key')
  ]
})

// All stores created after this will use the global config by default
```

## Multiple Store Management

```typescript
import { commit, dispatch, useStore } from '@quaengine/store'

// Create multiple stores
const userStore = createStore({ name: 'user', state: { name: '' } })
const gameStore = createStore({ name: 'game', state: { level: 1 } })

// Access stores by name
const store = useStore('user')

// Cross-store actions using store/action notation
await dispatch('user/login', { username: 'alice' })
commit('game/levelUp')
```

## API Reference

### Core Functions

- `createStore(options)` - Create a new store
- `configureStorage(config)` - Configure global storage settings
- `useStore(name)` - Get a store by name
- `dispatch(action, payload)` - Dispatch cross-store actions
- `commit(mutation, payload)` - Commit cross-store mutations

### Store Methods

- `store.commit(mutation, payload)` - Commit a mutation
- `store.dispatch(action, payload)` - Dispatch an action
- `store.snapshot(id?)` - Create a snapshot
- `store.restore(snapshotId, options?)` - Restore from snapshot
- `store.reset()` - Reset to initial state

### QuaStoreManager Methods

- `QuaStoreManager.createStore(options)` - Create and register a store
- `QuaStoreManager.snapshotAll(id?)` - Snapshot all stores
- `QuaStoreManager.restoreAll(snapshotId, options?)` - Restore all stores
- `QuaStoreManager.listSnapshots(storeName?)` - List snapshots
- `QuaStoreManager.deleteSnapshot(id)` - Delete a snapshot
- `QuaStoreManager.clearSnapshots(storeName?)` - Clear snapshots

## Storage Backends

### Included Backends

- **IndexedDBBackend** (default) - Browser persistence with IndexedDB
- **MemoryBackend** - In-memory storage (data lost on app close)
- **LocalStorageBackend** - Browser persistence with LocalStorage

### Backend Interface

```typescript
interface StorageBackend {
  init?: (options?: any) => Promise<void> | void
  saveSnapshot: (snapshot: QSSnapshot) => Promise<void>
  getSnapshot: (id: string) => Promise<QSSnapshot | undefined>
  deleteSnapshot: (id: string) => Promise<void>
  listSnapshots: (storeName?: string) => Promise<QSSnapshotMeta[]>
  clearSnapshots: (storeName?: string) => Promise<void>
  close?: () => Promise<void> | void
}
```

## Middleware Interface

```typescript
interface StorageMiddleware {
  beforeWrite?: (key: string, value: any) => any | Promise<any>
  afterRead?: (key: string, value: any) => any | Promise<any>
}
```

## Examples

Check the `/examples` directory for:

- [Usage Examples](./examples/usage.ts) - Basic usage patterns
- [Custom Backends](./examples/backends/custom-backends.ts) - Example backend implementations
- [Custom Middleware](./examples/middlewares/custom-middlewares.ts) - Example middleware implementations

## TypeScript Support

The library is fully typed and provides excellent TypeScript support:

```typescript
interface GameState {
  playerName: string
  level: number
  score: number
}

const typedStore = createStore({
  name: 'typedGame',
  state: {
    playerName: '',
    level: 1,
    score: 0
  } as GameState,
  mutations: {
    setPlayerName: (state: GameState, name: string) => {
      state.playerName = name // Fully typed
    }
  }
})
```

## Environment Support

- **Browser**: Full support with IndexedDB and LocalStorage backends
- **Node.js**: Supports custom backends (file system, database, etc.)
- **Electron/Tauri**: Works with any backend, ideal for desktop apps

## Error Handling

The library provides descriptive error messages:

```typescript
try {
  await store.restore('non-existent-snapshot')
}
catch (error) {
  console.error(error.message) // "Snapshot with id 'non-existent-snapshot' not found."
}
```

## Performance Considerations

- **Lazy Loading**: Storage managers are created only when needed
- **Efficient Serialization**: JSON serialization with optional compression middleware
- **Memory Management**: Automatic cleanup when stores are unregistered
- **Async Operations**: All storage operations are asynchronous and non-blocking

## Contributing

This package is part of the QuaEngine project. See the main repository for contribution guidelines.

## License

Apache 2.0 - see the main QuaEngine repository for details.
