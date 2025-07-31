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

// Mock URL.createObjectURL
Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  },
  writable: true
})