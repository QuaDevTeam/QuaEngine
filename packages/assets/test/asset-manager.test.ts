import type { AssetLocale, AssetType, LoadAssetOptions } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetManager } from '../src/asset-manager'

// Mock database for testing
const mockDatabase = {
  assets: {
    get: vi.fn(),
    put: vi.fn(),
    toArray: vi.fn(() => Promise.resolve([])),
    where: vi.fn(() => ({
      anyOf: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
  findAssets: vi.fn().mockResolvedValue([]),
  getAssetWithLocaleFallback: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(() => Promise.resolve()),
}

describe('assetManager', () => {
  let assetManager: AssetManager

  beforeEach(() => {
    vi.clearAllMocks()
    assetManager = new AssetManager(mockDatabase as any, 'default')
  })

  describe('asset Retrieval', () => {
    it('should create asset manager with default locale', () => {
      expect(assetManager).toBeDefined()
      // Test internal state through constructor behavior
      expect(() => new AssetManager(mockDatabase as any, 'en-us')).not.toThrow()
    })

    it('should handle different default locales', () => {
      const customAssetManager = new AssetManager(mockDatabase as any, 'zh-cn')
      expect(customAssetManager).toBeDefined()
    })

    it('should retrieve asset from database', async () => {
      const mockAsset = {
        id: 'test-bundle:default:images:test.png',
        bundleName: 'test-bundle',
        name: 'test.png',
        type: 'images' as AssetType,
        locale: 'default' as AssetLocale,
        blob: new Blob(['test data'], { type: 'image/png' }),
        hash: 'test-hash',
        size: 9,
        version: 1,
        mtime: Date.now(),
        createdAt: Date.now(),
        lastAccessed: Date.now(),
      }

      mockDatabase.findAssets.mockResolvedValue([mockAsset])

      const result = await assetManager.getBlob('images', 'test.png')

      expect(result).toBeInstanceOf(Blob)
      expect(mockDatabase.findAssets).toHaveBeenCalledWith({ type: 'images', name: 'test.png' })
    })

    it('should throw error for non-existent asset', async () => {
      mockDatabase.findAssets.mockResolvedValue([])

      try {
        await assetManager.getBlob('images', 'nonexistent.png')
        expect.fail('Should throw AssetNotFoundError')
      }
      catch (error) {
        expect(error.message).toContain('Asset not found')
        expect(error.message).toContain('images/nonexistent.png')
      }
    })

    it('should handle bundle-specific asset retrieval', async () => {
      const options: LoadAssetOptions = {
        bundleName: 'specific-bundle',
        locale: 'en-us',
      }

      mockDatabase.assets.get.mockResolvedValue(undefined)

      try {
        await assetManager.getBlob('scripts', 'test.js', options)
        expect.fail('Should throw AssetNotFoundError')
      }
      catch (error) {
        // The specific asset retrieval will be checked for in the database
        expect(mockDatabase.getAssetWithLocaleFallback).toHaveBeenCalledWith('specific-bundle', 'scripts', 'test.js', 'en-us')
      }
    })
  })

  describe('plugin Management', () => {
    it('should register processing plugins', () => {
      const mockPlugin = {
        name: 'test-processor',
        version: '1.0.0',
        supportedTypes: ['images'] as AssetType[],
        processAsset: vi.fn(asset => Promise.resolve(asset)),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      }

      expect(() => {
        assetManager.registerProcessingPlugin(mockPlugin)
      }).not.toThrow()
    })
  })

  describe('cache Management', () => {
    it('should provide cache statistics', () => {
      const stats = assetManager.getCacheStats()

      expect(stats).toHaveProperty('blobUrls')
      expect(stats).toHaveProperty('jsExecutions')
      expect(typeof stats.blobUrls).toBe('number')
      expect(typeof stats.jsExecutions).toBe('number')
    })

    it('should cleanup resources', () => {
      global.URL.revokeObjectURL = vi.fn()

      assetManager.cleanup()

      // Should not throw
      expect(assetManager.getCacheStats().blobUrls).toBe(0)
    })

    it('should clear specific asset cache', () => {
      expect(() => {
        assetManager.clearAssetCache('test-asset-id')
      }).not.toThrow()
    })
  })
})
