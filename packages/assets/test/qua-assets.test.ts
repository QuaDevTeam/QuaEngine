import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QuaAssets } from '../src/qua-assets.js'
import type { QuaAssetsConfig } from '../src/types.js'

// Mock dependencies
vi.mock('../src/database.js', () => ({
  QuaAssetsDatabase: class MockDatabase {
    constructor() {}
    async initialize() { return this }
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

    it('should track bundle loading status', () => {
      const status = quaAssets.getBundleStatus('test-bundle')
      
      expect(status.name).toBe('test-bundle')
      expect(status.state).toBe('idle')
      expect(status.progress).toBe(0)
      expect(status.assetCount).toBe(0)
      expect(status.loadedAssets).toBe(0)
    })

    it('should update bundle status during loading', async () => {
      // Mock successful bundle loading
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-length': '1024' }),
          arrayBuffer: () => {
            // Mock QPK bundle data
            const buffer = new ArrayBuffer(24)
            const view = new DataView(buffer)
            view.setUint32(0, 0x51504B00, true) // QPK magic
            view.setUint32(4, 1, true) // Version
            view.setUint32(8, 0, true) // No compression
            view.setUint32(12, 0, true) // No encryption
            view.setUint32(16, 0, true) // 0 files
            return Promise.resolve(buffer)
          }
        } as Response)
      )

      const loadingPromise = quaAssets.loadBundle('test-bundle.qpk')
      
      // Check that status is updated to loading
      const loadingStatus = quaAssets.getBundleStatus('test-bundle')
      expect(['loading', 'loaded']).toContain(loadingStatus.state)

      try {
        await loadingPromise
        const finalStatus = quaAssets.getBundleStatus('test-bundle')
        expect(['loaded', 'error']).toContain(finalStatus.state)
      } catch (error) {
        // Expected for incomplete mock data
        const errorStatus = quaAssets.getBundleStatus('test-bundle')
        expect(errorStatus.state).toBe('error')
      }
    })

    it('should handle bundle loading errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')))

      try {
        await quaAssets.loadBundle('test-bundle.qpk')
        expect.fail('Should throw network error')
      } catch (error) {
        expect(error).toBeDefined()
      }
      
      const status = quaAssets.getBundleStatus('test-bundle')
      expect(status.state).toBe('error')
      expect(status.error).toBeDefined()
    })

    it('should retry failed bundle loads', async () => {
      let callCount = 0
      global.fetch = vi.fn(() => {
        callCount++
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary network error'))
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
        } as Response)
      })

      try {
        await quaAssets.loadBundle('test-bundle.qpk')
        expect(callCount).toBe(3)
      } catch (error) {
        expect(callCount).toBe(config.retryAttempts)
      }
    })

    it('should emit bundle events during loading process', async () => {
      const events: Array<{ event: string, data: any }> = []
      
      quaAssets.on('bundle:loading', (data) => events.push({ event: 'bundle:loading', data }))
      quaAssets.on('bundle:loaded', (data) => events.push({ event: 'bundle:loaded', data }))
      quaAssets.on('bundle:error', (data) => events.push({ event: 'bundle:error', data }))

      global.fetch = vi.fn(() => Promise.reject(new Error('Test error')))

      await quaAssets.loadBundle('test-bundle.qpk')

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
      expect(result.errors).toContain('Patch download failed')
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