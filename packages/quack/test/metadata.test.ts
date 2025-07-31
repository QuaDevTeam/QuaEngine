import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MetadataGenerator } from '../src/metadata.js'
import type { AssetInfo } from '../src/types.js'

describe('MetadataGenerator', () => {
  let metadataGenerator: MetadataGenerator
  let mockAssets: AssetInfo[]

  beforeEach(() => {
    metadataGenerator = new MetadataGenerator()
    
    mockAssets = [
      {
        name: 'background.png',
        type: 'images' as const,
        subType: 'backgrounds' as const,
        path: '/test/images/backgrounds/background.png',
        relativePath: 'images/backgrounds/background.png',
        size: 1024000,
        hash: 'abc123',
        mtime: 1640995200000,
        locales: ['default']
      },
      {
        name: 'hero.sprite',
        type: 'characters' as const,
        subType: 'sprites' as const,
        path: '/test/characters/main/hero.sprite',
        relativePath: 'characters/main/hero.sprite',
        size: 2048,
        hash: 'def456',
        mtime: 1640995300000,
        locales: ['default', 'en-us']
      },
      {
        name: 'scene1.js',
        type: 'scripts' as const,
        subType: 'logic' as const,
        path: '/test/scripts/scenes/scene1.js',
        relativePath: 'scripts/scenes/scene1.js',
        size: 5120,
        hash: 'ghi789',
        mtime: 1640995400000,
        locales: ['default']
      },
      {
        name: 'scene1.en-us.js',
        type: 'scripts' as const,
        subType: 'logic' as const,
        path: '/test/scripts/scenes/scene1.en-us.js',
        relativePath: 'scripts/scenes/scene1.en-us.js',
        size: 5200,
        hash: 'jkl012',
        mtime: 1640995500000,
        locales: ['en-us']
      }
    ]
  })

  describe('Bundle Manifest Generation', () => {
    it('should generate complete bundle manifest', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'lzma' as const, level: 1 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.2.0',
        buildNumber: '42'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'test-bundle', options)

      expect(manifest.name).toBe('test-bundle')
      expect(manifest.version).toBe('1.2.0') 
      expect(manifest.buildNumber).toBe('42')
      expect(manifest.format).toBe('qpk')
      expect(manifest.compression.algorithm).toBe('lzma')
      expect(manifest.encryption.algorithm).toBe('none')
      expect(manifest.createdAt).toBeTypeOf('number')
      expect(Object.keys(manifest.assets)).toContain('images')
      expect(Object.keys(manifest.assets)).toContain('characters')
      expect(Object.keys(manifest.assets)).toContain('scripts')
      expect(manifest.locales).toContain('default')
      expect(manifest.locales).toContain('en-us')
    })

    it('should calculate total bundle size', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'size-test', options)
      
      const expectedSize = mockAssets.reduce((sum, asset) => sum + asset.size, 0)
      expect(manifest.totalSize).toBe(expectedSize)
    })

    it('should extract unique locales from assets', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'locale-test', options)
      
      expect(manifest.locales).toEqual(expect.arrayContaining(['default', 'en-us']))
      expect(manifest.locales).toHaveLength(2)
    })

    it('should categorize assets by type', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'type-test', options)
      
      const imageCount = Object.keys(manifest.assets.images || {}).length
      const characterCount = Object.keys(manifest.assets.characters || {}).length  
      const scriptCount = Object.keys(manifest.assets.scripts || {}).length
      
      expect(imageCount).toBe(1)
      expect(characterCount).toBe(1)
      expect(scriptCount).toBe(2)
    })

    it('should include asset metadata in manifest', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'metadata-test', options)
      
      // Check assets structure
      Object.values(manifest.assets).forEach(assetGroup => {
        Object.values(assetGroup).forEach(asset => {
          expect(asset).toHaveProperty('name')
          expect(asset).toHaveProperty('type')
          expect(asset).toHaveProperty('subType')
          expect(asset).toHaveProperty('size')
          expect(asset).toHaveProperty('hash')
          expect(asset).toHaveProperty('mtime')
          expect(asset).toHaveProperty('locales')
          expect(Array.isArray(asset.locales)).toBe(true)
        })
      })
    })
  })

  describe('Asset Statistics', () => {
    it('should generate asset type statistics', () => {
      const stats = metadataGenerator.generateAssetStats(mockAssets)
      
      expect(stats.totalAssets).toBe(4)
      expect(stats.totalSize).toBe(1024000 + 2048 + 5120 + 5200)
      expect(stats.byType.images.count).toBe(1)
      expect(stats.byType.images.size).toBe(1024000)
      expect(stats.byType.characters.count).toBe(1)
      expect(stats.byType.characters.size).toBe(2048)
      expect(stats.byType.scripts.count).toBe(2)
      expect(stats.byType.scripts.size).toBe(5120 + 5200)
    })

    it('should calculate largest and smallest assets', () => {
      const stats = metadataGenerator.generateAssetStats(mockAssets)
      
      expect(stats.largestAsset).not.toBeNull()
      expect(stats.largestAsset!.name).toBe('background.png')
      expect(stats.largestAsset!.size).toBe(1024000)
      expect(stats.smallestAsset).not.toBeNull()
      expect(stats.smallestAsset!.name).toBe('hero.sprite')
      expect(stats.smallestAsset!.size).toBe(2048)
    })

    it('should calculate average asset size', () => {
      const stats = metadataGenerator.generateAssetStats(mockAssets)
      
      const expectedAverage = (1024000 + 2048 + 5120 + 5200) / 4
      expect(stats.averageSize).toBe(expectedAverage)
    })

    it('should handle empty asset list', () => {
      const stats = metadataGenerator.generateAssetStats([])
      
      expect(stats.totalAssets).toBe(0)
      expect(stats.totalSize).toBe(0)
      expect(stats.averageSize).toBe(0)
      expect(stats.largestAsset).toBeNull()
      expect(stats.smallestAsset).toBeNull()
    })

    it('should calculate compression ratio estimates', () => {
      const stats = metadataGenerator.generateAssetStats(mockAssets)
      
      // Should provide estimates for different compression types
      expect(stats.compressionEstimates).toHaveProperty('lzma')
      expect(stats.compressionEstimates).toHaveProperty('deflate')
      expect(stats.compressionEstimates.lzma.ratio).toBeGreaterThan(0)
      expect(stats.compressionEstimates.lzma.ratio).toBeLessThanOrEqual(1)
      expect(stats.compressionEstimates.deflate.ratio).toBeGreaterThan(0)
      expect(stats.compressionEstimates.deflate.ratio).toBeLessThanOrEqual(1)
    })
  })

  describe('Dependency Analysis', () => {
    it('should detect asset dependencies', () => {
      const assetWithDeps: AssetInfo = {
        name: 'scene-with-deps.js',
        type: 'scripts' as const,
        subType: 'logic' as const,
        path: '/test/scripts/scenes/scene-with-deps.js',
        relativePath: 'scripts/scenes/scene-with-deps.js',
        size: 1024,
        hash: 'deps123',
        mtime: Date.now(),
        locales: ['default']
      }

      const assetsWithDeps = [...mockAssets, assetWithDeps]
      const dependencies = metadataGenerator.analyzeDependencies(assetsWithDeps)
      
      expect(dependencies).toHaveProperty('scene-with-deps.js')
      expect(dependencies['scene-with-deps.js']).toContain('background.png')
      expect(dependencies['scene-with-deps.js']).toContain('hero.sprite')
    })

    it('should detect circular dependencies', () => {
      const circularAssets: AssetInfo[] = [
        {
          name: 'a.js',
          type: 'scripts' as const,
          subType: 'logic' as const,
          path: '/test/a.js',
          relativePath: 'a.js',
          size: 100,
          hash: 'a123',
          mtime: Date.now(),
          locales: ['default']
        },
        {
          name: 'b.js', 
          type: 'scripts' as const,
          subType: 'logic' as const,
          path: '/test/b.js',
          relativePath: 'b.js',
          size: 100,
          hash: 'b123',
          mtime: Date.now(),
          locales: ['default']
        }
      ]

      const result = metadataGenerator.analyzeDependencies(circularAssets)
      const warnings = metadataGenerator.validateDependencies(circularAssets)
      
      expect(warnings.some(w => w.includes('circular'))).toBe(true)
    })

    it('should detect missing dependencies', () => {
      const assetWithMissingDep: AssetInfo = {
        name: 'dependent.js',
        type: 'scripts' as const,
        subType: 'logic' as const,
        path: '/test/dependent.js',
        relativePath: 'dependent.js',
        size: 100,
        hash: 'dep123',
        mtime: Date.now(),
        locales: ['default']
      }

      const warnings = metadataGenerator.validateDependencies([assetWithMissingDep])
      
      expect(warnings.some(w => w.includes('missing-asset.png'))).toBe(true)
    })
  })

  describe('Locale Analysis', () => {
    it('should analyze locale coverage', () => {
      const localeAnalysis = metadataGenerator.analyzeLocales(mockAssets)
      
      expect(localeAnalysis.availableLocales).toContain('default')
      expect(localeAnalysis.availableLocales).toContain('en-us')
      expect(localeAnalysis.coverage.default).toBe(3) // Three assets have default
      expect(localeAnalysis.coverage['en-us']).toBe(2) // hero.sprite and scene1.en-us.js have en-us
    })

    it('should identify incomplete locale coverage', () => {
      const analysis = metadataGenerator.analyzeLocales(mockAssets)
      
      expect(analysis.incompleteLocales).toContain('en-us')
      expect(analysis.incompleteAssets['en-us']).toEqual(
        expect.arrayContaining(['background.png', 'scene1.js'])
      )
    })

    it('should suggest locale fallbacks', () => {
      const suggestions = metadataGenerator.suggestLocaleFallbacks(mockAssets)
      
      expect(suggestions).toHaveProperty('en-us')
      expect(suggestions['en-us'].fallback).toBe('default')
      expect(suggestions['en-us'].coverage).toBeGreaterThan(0)
    })
  })

  describe('Hash Generation', () => {
    it('should generate bundle hash from asset hashes', () => {
      const bundleHash = metadataGenerator.generateBundleHash(mockAssets)
      
      expect(bundleHash).toBeTypeOf('string')
      expect(bundleHash).toHaveLength(64) // SHA-256 hash
    })

    it('should generate different hashes for different asset sets', () => {
      const hash1 = metadataGenerator.generateBundleHash(mockAssets)
      const hash2 = metadataGenerator.generateBundleHash(mockAssets.slice(0, 2))
      
      expect(hash1).not.toBe(hash2)
    })

    it('should generate same hash for same assets in different order', () => {
      const shuffledAssets = [...mockAssets].reverse()
      const hash1 = metadataGenerator.generateBundleHash(mockAssets)
      const hash2 = metadataGenerator.generateBundleHash(shuffledAssets)
      
      expect(hash1).toBe(hash2)
    })
  })

  describe('Version Information', () => {
    it('should include build metadata in manifest', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'lzma' as const, level: 1 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '2.1.0',
        buildNumber: '123',
        buildMetadata: {
          branch: 'main',
          commit: 'abc123def',
          buildTime: '2024-01-01T12:00:00Z',
          builder: 'ci-system'
        }
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'versioned-bundle', options)
      
      expect(manifest.buildMetadata).toBeDefined()
      expect(manifest.buildMetadata?.branch).toBe('main')
      expect(manifest.buildMetadata?.commit).toBe('abc123def')
      expect(manifest.buildMetadata?.buildTime).toBe('2024-01-01T12:00:00Z')
      expect(manifest.buildMetadata?.builder).toBe('ci-system')
    })

    it('should validate version format', () => {
      const validVersions = ['1.0.0', '2.1.3', '10.20.30-alpha', '1.0.0-beta.1']
      const invalidVersions = ['1.0', 'v1.0.0', '1.0.0.0', 'invalid']

      validVersions.forEach(version => {
        expect(() => {
          metadataGenerator.validateVersion(version)
        }).not.toThrow()
      })

      invalidVersions.forEach(version => {
        expect(() => {
          metadataGenerator.validateVersion(version)
        }).toThrow()
      })
    })
  })

  describe('Performance Metrics', () => {
    it('should include performance estimates in manifest', () => {
      const options = {
        format: 'qpk' as const,
        compression: { algorithm: 'lzma' as const, level: 1 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      }

      const manifest = metadataGenerator.generateManifest(mockAssets, 'perf-test', options)
      
      expect(manifest.performanceMetrics).toBeDefined()
      expect(manifest.performanceMetrics?.estimatedLoadTime).toBeGreaterThan(0)
      expect(manifest.performanceMetrics?.estimatedDecompressionTime).toBeGreaterThan(0)
      expect(manifest.performanceMetrics?.memoryUsageEstimate).toBeGreaterThan(0)
    })

    it('should calculate load time estimates based on bundle size', () => {
      const smallAssets = mockAssets.slice(0, 1) // Just background.png
      const largeAssets = mockAssets // All assets

      const smallManifest = metadataGenerator.generateManifest(smallAssets, 'small', {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      })

      const largeManifest = metadataGenerator.generateManifest(largeAssets, 'large', {
        format: 'qpk' as const,
        compression: { algorithm: 'none' as const, level: 0 },
        encryption: { enabled: false, algorithm: 'none' as const },
        version: '1.0.0'
      })

      expect(largeManifest.performanceMetrics?.estimatedLoadTime)
        .toBeGreaterThan(smallManifest.performanceMetrics?.estimatedLoadTime || 0)
    })
  })
})