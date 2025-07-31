export { default as QuaStore } from './store';
export { default as QuaStoreManager, useStore, dispatch, commit } from './manager';
export * from './types/base';
export * from './types/storage';
export { StorageManager } from './storage/manager';
export { IndexedDBBackend } from './backends/indexeddb';
export { MemoryBackend } from './backends/memory';

import QuaStoreManager from './manager';

// Convenience function for creating stores
export const createStore = QuaStoreManager.createStore.bind(QuaStoreManager);

// Convenience function for configuring global storage
export const configureStorage = QuaStoreManager.configureStorage.bind(QuaStoreManager);
