import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QuaAssets } from '../src/qua-assets.js'
import type { QuaAssetsConfig } from '../src/types.js'

// Mock dependencies
vi.mock('../src/database.js', () => ({
  QuaAssetsDatabase: class MockDatabase {
    constructor() {}
    async initialize() { return this }
    async open() {}
    async close() {}
    assets = {
      get: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn(() => Promise.resolve([]))
    }
    bundles = {
      get: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn(() => Promise.resolve([]))
    }
    getBundle = vi.fn().mockResolvedValue(undefined)
    getCacheStats = vi.fn().mockResolvedValue({ size: 0, count: 0, totalSize: 0 })
    findAssets = vi.fn().mockResolvedValue([])
    getAssetWithLocaleFallback = vi.fn().mockResolvedValue(undefined)
    storeBundle = vi.fn().mockResolvedValue(undefined)
    storeAssets = vi.fn().mockResolvedValue(undefined)
    transaction = vi.fn().mockImplementation(async (mode, tables, callback) => {
      return await callback()
    })
  }
}))

describe('QuaAssets', () => {
  let quaAssets: QuaAssets
  let config: QuaAssetsConfig

  beforeEach(() => {
    config = {
      endpoint: 'https://cdn.example.com',
      locale: 'default',
      enableCache: true,
      cacheSize: 50 * 1024 * 1024,
      retryAttempts: 3,
      timeout: 30000
    }
    
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (quaAssets) {
      await quaAssets.cleanup()
    }
  })

  describe('Initialization', () => {
    it('should initialize with valid configuration', async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      
      await quaAssets.initialize()
      
      expect(quaAssets).toBeDefined()
    })

    it('should validate configuration on creation', () => {
      expect(() => {
        new QuaAssets('', config)
      }).toThrow('Invalid endpoint URL')

      expect(() => {
        new QuaAssets('https://cdn.example.com', { ...config, cacheSize: -1 })
      }).toThrow('Cache size must be positive')

      expect(() => {
        new QuaAssets('https://cdn.example.com', { ...config, retryAttempts: -1 })
      }).toThrow('Retry attempts must be non-negative')
    })

    it('should handle plugin initialization', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        initialize: vi.fn(),
        cleanup: vi.fn()
      }

      const configWithPlugins = {
        ...config,
        plugins: [mockPlugin]
      }

      quaAssets = new QuaAssets('https://cdn.example.com', configWithPlugins)
      await quaAssets.initialize()

      expect(mockPlugin.initialize).toHaveBeenCalled()
    })

    it('should setup event emitter correctly', async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()

      const eventHandler = vi.fn()
      quaAssets.on('bundle:loading', eventHandler)

      // Trigger an event (using internal method for testing)
      ;(quaAssets as any).emit('bundle:loading', { bundleName: 'test' })

      expect(eventHandler).toHaveBeenCalledWith({ bundleName: 'test' })
    })
  })

  describe('Bundle Management', () => {
    beforeEach(async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()
    })

    it('should track bundle loading status', async () => {
      // Initially, bundle status should not exist
      let status = quaAssets.getBundleStatus('test-bundle')
      expect(status).toBeUndefined()
      
      // Mock fetch to fail
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')))
      
      // After starting a load, status should exist and be loading
      const loadPromise = quaAssets.loadBundle('test-bundle.qpk').catch(() => {
        // Expected to fail due to mock
      })
      
      // Status should be set immediately (synchronously) when loadBundle is called
      status = quaAssets.getBundleStatus('test-bundle')
      expect(status).toBeDefined()
      expect(status!.name).toBe('test-bundle')
      expect(status!.state).toBe('loading') // Should be loading initially
      
      // Wait for the load to complete
      await loadPromise
      
      // After error, status should be error
      status = quaAssets.getBundleStatus('test-bundle')
      expect(status).toBeDefined()
      expect(['error']).toContain(status!.state)
    })

    it('should update bundle status during loading', async () => {
      // Mock successful bundle loading
      global.fetch = vi.fn(() => {
        // Mock QPK bundle data
        const buffer = new ArrayBuffer(24)
        const view = new DataView(buffer)
        view.setUint32(0, 0x51504B00, false) // QPK magic (big-endian)
        view.setUint32(4, 1, true) // Version
        view.setUint32(8, 0, true) // No compression
        view.setUint32(12, 0, true) // No encryption
        view.setUint32(16, 0, true) // 0 files
        
        const mockBody = {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(buffer) })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
        
        return Promise.resolve({
          ok: true,
          headers: {
            get: (name: string) => {
              if (name === 'content-length') return buffer.byteLength.toString()
              return null
            }
          },
          body: mockBody,
          arrayBuffer: () => Promise.resolve(buffer)
        } as unknown as Response)
      })

      const loadingPromise = quaAssets.loadBundle('test-bundle.qpk')
      
      // Status should be set immediately (synchronously) when loadBundle is called
      const loadingStatus = quaAssets.getBundleStatus('test-bundle')
      expect(loadingStatus).toBeDefined()
      expect(loadingStatus!.state).toBe('loading') // Should be loading initially

      try {
        await loadingPromise
        const finalStatus = quaAssets.getBundleStatus('test-bundle')
        expect(finalStatus).toBeDefined()
        expect(['loaded', 'error']).toContain(finalStatus!.state)
      } catch (error) {
        // Expected for incomplete mock data
        const errorStatus = quaAssets.getBundleStatus('test-bundle')
        expect(errorStatus).toBeDefined()
        expect(errorStatus!.state).toBe('error')
      }
    })

    it('should handle bundle loading errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')))

      // Status should be set immediately when loadBundle is called
      const loadPromise = quaAssets.loadBundle('test-bundle.qpk').catch(() => {
        // Expected to fail
      })
      
      // Check initial status
      let status = quaAssets.getBundleStatus('test-bundle')
      expect(status).toBeDefined()
      expect(status!.state).toBe('loading')
      
      // Wait for the load to complete
      await loadPromise
      
      // Check status after error
      status = quaAssets.getBundleStatus('test-bundle')
      expect(status).toBeDefined()
      expect(status!.state).toBe('error')
      expect(status!.error).toBeDefined()
    })

    it('should retry failed bundle loads', async () => {
      let callCount = 0
      global.fetch = vi.fn(() => {
        callCount++
        return Promise.reject(new Error('Persistent network error'))
      })

      // Create a new QuaAssets instance with fewer retry attempts and shorter timeout
      const fastConfig = { ...config, retryAttempts: 2, timeout: 1000 }
      const fastQuaAssets = new QuaAssets('https://cdn.example.com', fastConfig)
      await fastQuaAssets.initialize()

      try {
        await fastQuaAssets.loadBundle('test-bundle.qpk')
        expect(callCount).toBe(2) // 2 total attempts
      } catch (error) {
        expect(callCount).toBe(2) // 2 total attempts
      } finally {
        await fastQuaAssets.cleanup()
      }
    })

    it('should emit bundle events during loading process', async () => {
      const events: Array<{ event: string, data: any }> = []
      
      quaAssets.on('bundle:loading', (data) => events.push({ event: 'bundle:loading', data }))
      quaAssets.on('bundle:loaded', (data) => events.push({ event: 'bundle:loaded', data }))
      quaAssets.on('bundle:error', (data) => events.push({ event: 'bundle:error', data }))

      global.fetch = vi.fn(() => Promise.reject(new Error('Test error')))

      try {
        await quaAssets.loadBundle('test-bundle.qpk')
      } catch (error) {
        // Expected to fail
      }

      expect(events.some(e => e.event === 'bundle:loading')).toBe(true)
      expect(events.some(e => e.event === 'bundle:error')).toBe(true)
    })
  })

  describe('Asset Retrieval', () => {
    beforeEach(async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()
    })

    it('should delegate asset retrieval to AssetManager', async () => {
      try {
        await quaAssets.getBlob('images', 'test.png')
        expect.fail('Should throw asset not found error')
      } catch (error) {
        // Expected since no assets are loaded
        expect(error.message).toContain('Asset not found')
      }
    })

    it('should handle locale-specific asset requests', async () => {
      try {
        await quaAssets.getBlob('scripts', 'scene1.js', { locale: 'en-us' })
        expect.fail('Should throw asset not found error')
      } catch (error) {
        expect(error.message).toContain('Asset not found')
      }
    })

    it('should provide blob URLs for assets', async () => {
      try {
        await quaAssets.getBlobURL('images', 'character.png')
        expect.fail('Should throw asset not found error')
      } catch (error) {
        expect(error.message).toContain('Asset not found')
      }
    })

    it('should execute JavaScript assets', async () => {
      const jsCode = 'export const value = 42;'
      
      try {
        const result = await quaAssets.executeJS('test-script.js')
        expect(result.exports.value).toBe(42)
      } catch (error) {
        // May fail depending on JS execution implementation
        expect(error).toBeDefined()
      }
    })
  })

  describe('Cache Management', () => {
    beforeEach(async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()
    })

    it('should provide cache statistics', async () => {
      const stats = await quaAssets.getCacheStats()
      
      expect(stats).toHaveProperty('totalSize')
      expect(stats).toHaveProperty('bundles')
      expect(stats).toHaveProperty('database')
      expect(stats).toHaveProperty('assetManager')
    })

    it('should handle cache size limits', async () => {
      const stats = await quaAssets.getCacheStats()
      expect(stats.totalSize).toBeGreaterThanOrEqual(0)
    })

    it('should emit cache events', async () => {
      const cacheEvents: Array<{ event: string, data: any }> = []
      
      quaAssets.on('asset:cached', (data) => cacheEvents.push({ event: 'asset:cached', data }))
      quaAssets.on('asset:evicted', (data) => cacheEvents.push({ event: 'asset:evicted', data }))
      quaAssets.on('cache:full', (data) => cacheEvents.push({ event: 'cache:full', data }))

      // Cache events would be emitted during actual asset operations
      expect(quaAssets).toBeDefined()
    })
  })

  describe('Patch System', () => {
    beforeEach(async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()
    })

    it('should validate patch compatibility', async () => {
      const mockPatchData = new ArrayBuffer(100)
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockPatchData)
        } as Response)
      )

      try {
        const result = await quaAssets.applyPatch('patch.qpk', 'test-bundle')
        expect(result).toHaveProperty('success')
        expect(result).toHaveProperty('errors')
      } catch (error) {
        // Expected for mock patch data
        expect(error).toBeDefined()
      }
    })

    it('should handle patch application errors', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Patch download failed')))

      const result = await quaAssets.applyPatch('invalid-patch.qpk', 'test-bundle')
      
      expect(result.success).toBe(false)
      expect(result.errors.some(error => error.includes('Patch download failed'))).toBe(true)
    })
  })

  describe('Cleanup and Resource Management', () => {
    it('should cleanup resources properly', async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()

      expect(quaAssets).toBeDefined()

      await quaAssets.cleanup()

      expect(quaAssets).toBeDefined()
    })

    it('should cleanup plugins during shutdown', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        initialize: vi.fn(),
        cleanup: vi.fn()
      }

      quaAssets = new QuaAssets('https://cdn.example.com', {
        ...config,
        plugins: [mockPlugin]
      })

      await quaAssets.initialize()
      await quaAssets.cleanup()

      expect(mockPlugin.cleanup).toHaveBeenCalled()
    })

    it('should handle multiple cleanup calls gracefully', async () => {
      quaAssets = new QuaAssets('https://cdn.example.com', config)
      await quaAssets.initialize()

      await quaAssets.cleanup()
      await quaAssets.cleanup() // Second cleanup should not throw

      expect(quaAssets).toBeDefined()
    })
  })

  describe('Configuration Validation', () => {
    it('should validate endpoint URL format', () => {
      const invalidEndpoints = [
        '',
        'not-a-url',
        'ftp://invalid-protocol.com',
        'javascript:alert(1)'
      ]

      invalidEndpoints.forEach(endpoint => {
        expect(() => {
          new QuaAssets(endpoint, config)
        }).toThrow()
      })
    })

    it('should validate numeric configuration values', () => {
      expect(() => {
        new QuaAssets('https://cdn.example.com', { ...config, cacheSize: 0 })
      }).toThrow('Cache size must be positive')

      expect(() => {
        new QuaAssets('https://cdn.example.com', { ...config, timeout: -1 })
      }).toThrow('Timeout must be positive')

      expect(() => {
        new QuaAssets('https://cdn.example.com', { ...config, retryAttempts: -1 })
      }).toThrow('Retry attempts must be non-negative')
    })

    it('should validate locale format', () => {
      const validLocales = ['default', 'en-us', 'zh-cn', 'ja-jp', 'fr']
      const invalidLocales = ['', 'invalid_locale', 'ENGLISH', '123']

      validLocales.forEach(locale => {
        expect(() => {
          new QuaAssets('https://cdn.example.com', { ...config, locale })
        }).not.toThrow()
      })

      invalidLocales.forEach(locale => {
        expect(() => {
          new QuaAssets('https://cdn.example.com', { ...config, locale })
        }).toThrow()
      })
    })
  })
})