# @quajs/store

A flexible, TypeScript-first state management library with pluggable storage backends and middleware support.

## Features

- **Redux-like Architecture**: Familiar state management patterns with state, mutations, actions, and getters
- **Pluggable Storage Backends**: Use the included memory backend, inject platform adapters such as `@quajs/store-web` or `@quajs/store-node`, or create custom backends
- **Middleware System**: Add encryption, compression, logging, validation, and more
- **Snapshot System**: Save and restore complete application state
- **TypeScript-First**: Full type safety and excellent IDE support
- **Multiple Store Management**: Create and manage multiple stores with ease
- **Universal**: Works in both browser and Node.js environments (backend-dependent)

## Installation

```bash
npm install @quajs/store
# or
pnpm add @quajs/store
```

## Quick Start

### Basic Store Creation

```typescript
import { createStore } from '@quajs/store'

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
const playerInfo = gameStore.getters.playerInfo // "Bob - Level 1"
```

## Storage Backends

### Default Memory Backend

By default, store snapshots and save slots use the platform-neutral in-memory backend. This keeps `@quajs/store` free of Web APIs. Applications that need durable saves must inject a storage backend.

```typescript
const store = createStore({
  name: 'myStore',
  state: { data: 'kept in memory unless storage is configured' }
})
```

### Web IndexedDB Backend

Browser persistence lives in the Web adapter package and is injected through the same storage contract:

```typescript
import { configureStorage } from '@quajs/store'
import { createWebStoreStorage } from '@quajs/store-web'

configureStorage(createWebStoreStorage({ dbName: 'MyGameSaves' }))
```

### Node .quastore File Backend

Node persistence lives in `@quajs/store-node`. It writes binary `.quastore` files and encrypts them by default with a user-provided key.

```typescript
import { configureStorage } from '@quajs/store'
import { createNodeStoreStorage } from '@quajs/store-node'

configureStorage(createNodeStoreStorage({
  rootDir: './saves',
  encryption: {
    key: process.env.QUASTORE_KEY
  }
}))
```

If `encryption.key` is omitted, the backend reads `QUASTORE_KEY`. To write plaintext `.quastore` files for development only, pass `encryption: false`.

### Custom Storage Backend

You can specify a different storage backend:

```typescript
import { createStore, MemoryBackend } from '@quajs/store'

// Use memory storage (data lost on app close)
const tempStore = createStore({
  name: 'tempStore',
  state: { temp: 'data' },
  storage: {
    backend: MemoryBackend
  }
})

// Custom backend with options
const customStore = createStore({
  name: 'customStore',
  state: { data: 'value' },
  storage: {
    backend: {
      driver: FileSystemBackend,
      options: { basePath: './saves' }
    }
  }
})
```

### Creating Custom Backends

Implement the `StorageBackend` interface:

```typescript
import {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
  StorageBackend,
} from '@quajs/store'

class FileSystemBackend implements StorageBackend {
  constructor(private basePath: string) {}

  async saveSnapshot(snapshot: QuaSnapshot): Promise<void> {
    // Implement file system storage
  }

  async getSnapshot(id: string): Promise<QuaSnapshot | undefined> {
    // Implement file system retrieval
  }

  // ... implement other required methods
}
```

## Middleware System

Middleware allows you to intercept and modify data during storage operations:

### Middleware Example

```typescript
import { createStore, StorageMiddleware } from '@quajs/store'

class AuditMiddleware implements StorageMiddleware {
  beforeWrite(key, value) {
    return {
      ...value,
      metadata: {
        ...value.metadata,
        updatedBy: 'player-session',
      },
    }
  }
}

const secureStore = createStore({
  name: 'secureStore',
  state: { sensitiveData: 'secret' },
  storage: {
    middlewares: [
      new AuditMiddleware()
    ]
  }
})
```

### Custom Middleware

```typescript
import { StorageMiddleware } from '@quajs/store'

class TimestampMiddleware implements StorageMiddleware {
  async beforeWrite(key: string, value: any): Promise<any> {
    return {
      ...value,
      _timestamp: Date.now()
    }
  }

  async afterRead(key: string, value: any): Promise<any> {
    return {
      ...value,
      _readAt: Date.now()
    }
  }
}
```

## Snapshot System

Save and restore complete application state:

```typescript
// Single-store snapshots
import { QuaStoreManager } from '@quajs/store'

const snapshotId = await store.snapshot('save-point-1')
await store.restore(snapshotId)

// Manager single-store snapshots
const progressionSnapshotId = await QuaStoreManager.snapshotStore('progression', 'day-3')
await QuaStoreManager.restoreStore('progression', progressionSnapshotId, { force: true })

// Scoped snapshots for selected stores
const scopedSnapshotId = await QuaStoreManager.snapshotStores(['engine', 'progression'], 'checkpoint-1')
await QuaStoreManager.restoreStores(scopedSnapshotId, { force: true })

// Global snapshots for all registered stores
const globalSnapshotId = await QuaStoreManager.snapshotAll('checkpoint-1')
await QuaStoreManager.restoreAll(globalSnapshotId, { force: true })

// Unified scoped API
const allSnapshotId = await QuaStoreManager.snapshot({ scope: 'all', id: 'autosave' })
await QuaStoreManager.restore(allSnapshotId, { force: true })

// List all snapshots
const snapshots = await QuaStoreManager.listSnapshots()
```

## State Serialization

Store state serialization is pluggable. The default serializer keeps the current JSON clone behavior, while custom serializers can encode state types such as `Map`, `Date`, or domain classes before snapshots and save slots are written.

```typescript
import { configureSerialization, createStore, QuaStateSerializer } from '@quajs/store'

const mapSerializer: QuaStateSerializer = {
  serialize(state) {
    return {
      ...state,
      values: Array.from(state.values.entries())
    }
  },
  deserialize(serializedState) {
    return {
      ...serializedState,
      values: new Map(serializedState.values)
    }
  }
}

// Per-store serializer
const growthStore = createStore({
  name: 'growth',
  state: { values: new Map([['charm', 1]]) },
  serializer: mapSerializer
})

// Global serializer for stores created after this call
configureSerialization(mapSerializer)
```

## Global Configuration

Configure storage settings globally:

```typescript
import { configureStorage, StorageMiddleware } from '@quajs/store'

class EncryptSaveMiddleware implements StorageMiddleware {
  beforeWrite(key, value) {
    // Encrypt or encode the full snapshot/save slot envelope here.
    return value
  }

  afterRead(key, value) {
    // Decrypt or decode the full snapshot/save slot envelope here.
    return value
  }
}

configureStorage({
  backend: {
    driver: FileSystemBackend,
    options: { basePath: './saves' }
  },
  middlewares: [
    new EncryptSaveMiddleware()
  ]
})

// All stores created after this will use the global config by default
```

## Multiple Store Management

```typescript
import { commit, dispatch, useStore } from '@quajs/store'

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
- `configureSerialization(serializer)` - Configure global state serialization for subsequently created stores
- `useStore(name)` - Get a store by name
- `dispatch(action, payload)` - Dispatch cross-store actions
- `commit(mutation, payload)` - Commit cross-store mutations
- `snapshot(options)` - Snapshot one, selected, or all stores
- `restore(snapshotId, options?)` - Restore one, selected, or all stores

### Store Methods

- `store.commit(mutation, payload)` - Commit a mutation
- `store.dispatch(action, payload)` - Dispatch an action
- `store.snapshot(id?)` - Create a snapshot
- `store.restore(snapshotId, options?)` - Restore from snapshot
- `store.reset()` - Reset to initial state

### QuaStoreManager Methods

- `QuaStoreManager.createStore(options)` - Create and register a store
- `QuaStoreManager.snapshotStore(storeName, id?)` - Snapshot one store
- `QuaStoreManager.snapshotStores(storeNames, id?)` - Snapshot selected stores
- `QuaStoreManager.snapshotAll(id?)` - Snapshot all stores
- `QuaStoreManager.snapshot(options)` - Snapshot by scope (`storeName`, `storeNames`, or `scope: 'all'`)
- `QuaStoreManager.restoreStore(storeName, snapshotId, options?)` - Restore one store
- `QuaStoreManager.restoreStores(snapshotId, options?)` - Restore selected stores from a scoped snapshot
- `QuaStoreManager.restoreAll(snapshotId, options?)` - Restore all stores
- `QuaStoreManager.restore(snapshotId, options?)` - Restore by explicit scope or auto-detect scoped snapshots
- `QuaStoreManager.listSnapshots(storeName?)` - List snapshots
- `QuaStoreManager.deleteSnapshot(id)` - Delete a snapshot
- `QuaStoreManager.clearSnapshots(storeName?)` - Clear snapshots

## Storage Backends

### Included Backends

- **MemoryBackend** - In-memory storage, included in `@quajs/store`
- **IndexedDBBackend** - Browser persistence, provided by `@quajs/store-web`
- **QuastoreFileBackend** - Encrypted binary `.quastore` file persistence, provided by `@quajs/store-node`

### Backend Interface

```typescript
interface StorageBackend {
  init?: (options?: any) => Promise<void> | void
  saveSnapshot: (snapshot: QuaSnapshot) => Promise<void>
  getSnapshot: (id: string) => Promise<QuaSnapshot | undefined>
  deleteSnapshot: (id: string) => Promise<void>
  listSnapshots: (storeName?: string) => Promise<QuaSnapshotMeta[]>
  clearSnapshots: (storeName?: string) => Promise<void>
  saveGameSlotIndex: (slot: QuaGameSaveSlotIndex) => Promise<void>
  getGameSlotIndex: (slotId: string) => Promise<QuaGameSaveSlotIndex | undefined>
  listGameSlotIndexes: () => Promise<QuaGameSaveSlotIndex[]>
  deleteGameSlotIndex: (slotId: string) => Promise<void>
  saveGameSlotPayload: (slot: QuaGameSaveSlotPayload) => Promise<void>
  getGameSlotPayload: (slotId: string) => Promise<QuaGameSaveSlotPayload | undefined>
  deleteGameSlotPayload: (slotId: string) => Promise<void>
  saveGameSlotPreview: (preview: QuaGameSavePreviewRecord) => Promise<void>
  getGameSlotPreview: (previewId: string) => Promise<QuaGameSavePreviewRecord | undefined>
  deleteGameSlotPreview: (previewId: string) => Promise<void>
  clearGameSlots: () => Promise<void>
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

- **Browser**: Use `@quajs/store-web` for IndexedDB persistence or inject a custom browser backend
- **Node.js**: Use `@quajs/store-node` for encrypted `.quastore` files or inject a custom backend
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
