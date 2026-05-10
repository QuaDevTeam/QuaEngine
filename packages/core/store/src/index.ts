import QuaStoreManager from './manager'

export { IndexedDBBackend } from './backends/indexeddb'
export { MemoryBackend } from './backends/memory'
export { commit, dispatch, default as QuaStoreManager, useStore } from './manager'
export { StorageManager } from './storage/manager'
export { default as QuaStore } from './store'
export * from './types/base'
export * from './types/storage'

// Convenience function for creating stores
export const createStore = QuaStoreManager.createStore.bind(QuaStoreManager)

// Convenience function for configuring global storage
export const configureStorage = QuaStoreManager.configureStorage.bind(QuaStoreManager)

// Convenience functions for scoped snapshots
export const snapshot = QuaStoreManager.snapshot.bind(QuaStoreManager)
export const snapshotStore = QuaStoreManager.snapshotStore.bind(QuaStoreManager)
export const snapshotStores = QuaStoreManager.snapshotStores.bind(QuaStoreManager)
export const snapshotAll = QuaStoreManager.snapshotAll.bind(QuaStoreManager)
export const restore = QuaStoreManager.restore.bind(QuaStoreManager)
export const restoreStore = QuaStoreManager.restoreStore.bind(QuaStoreManager)
export const restoreStores = QuaStoreManager.restoreStores.bind(QuaStoreManager)
export const restoreAll = QuaStoreManager.restoreAll.bind(QuaStoreManager)
