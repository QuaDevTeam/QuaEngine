import { beforeAll, afterEach } from 'vitest'

// Global test setup
beforeAll(() => {
  // Set up global test environment
  console.log('🧪 Setting up QuaEngine test environment')
})

// Clean up after each test
afterEach(() => {
  // Clean up any global state between tests
})

// Mock IndexedDB for browser tests
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: () => ({
      result: {
        transaction: () => ({
          objectStore: () => ({
            get: () => ({ result: null }),
            put: () => ({}),
            delete: () => ({}),
            getAll: () => ({ result: [] })
          })
        })
      }
    })
  },
  writable: true
})

// Mock Web Workers
Object.defineProperty(global, 'Worker', {
  value: class MockWorker {
    constructor() {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  },
  writable: true
})

// Mock object URL helpers without replacing the URL constructor.
Object.defineProperty(global.URL, 'createObjectURL', {
  value: () => 'blob:mock-url',
  writable: true,
  configurable: true
})

Object.defineProperty(global.URL, 'revokeObjectURL', {
  value: () => {},
  writable: true,
  configurable: true
})
