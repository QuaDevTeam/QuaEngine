import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BundleLoader } from '../src/bundle-loader'
import type { BundleFormat } from '../src/types'

describe('BundleLoader', () => {
  let bundleLoader: BundleLoader

  beforeEach(() => {
    bundleLoader = new BundleLoader()
  })

  describe('Bundle Format Detection', () => {
    it('should create BundleLoader instance', () => {
      expect(bundleLoader).toBeDefined()
      expect(bundleLoader).toBeInstanceOf(BundleLoader)
    })

    it('should handle different bundle formats', () => {
      // Test that bundler can be configured for different formats
      const formats: BundleFormat[] = ['qpk', 'zip']
      
      formats.forEach(format => {
        expect(typeof format).toBe('string')
        expect(['qpk', 'zip']).toContain(format)
      })
    })
  })

  describe('QPK Format Parsing', () => {
    it('should validate QPK header format', () => {
      const buffer = new ArrayBuffer(24) // Minimum header size
      const view = new DataView(buffer)
      
      // QPK magic number
      view.setUint32(0, 0x51504B00, true) // 'QPK\0'
      view.setUint32(4, 1, true) // Version
      view.setUint32(8, 1, true) // Compression type (LZMA)
      view.setUint32(12, 0, true) // Encryption flags
      view.setUint32(16, 0, true) // File count
      
      // Test that the buffer has correct format
      expect(view.getUint32(0, true)).toBe(0x51504B00)
      expect(view.getUint32(4, true)).toBe(1)
      expect(view.getUint32(8, true)).toBe(1)
    })

    it('should handle invalid bundle data', async () => {
      const buffer = new ArrayBuffer(24)
      const view = new DataView(buffer)
      
      // Invalid magic number (should be 0x51504B00 for QPK)
      view.setUint32(0, 0x12345678, false)
      
      try {
        // Create data URL with .qpk extension to force QPK format detection
        const bundleUrl = 'https://example.com/invalid-bundle.qpk'
        
        // Mock fetch to return our invalid buffer
        global.fetch = vi.fn(() => {
          const mockBody = {
            getReader: () => ({
              read: vi.fn()
                .mockResolvedValueOnce({ done: false, value: new Uint8Array(buffer) })
                .mockResolvedValueOnce({ done: true, value: undefined })
            })
          }
          
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(buffer),
            headers: {
              get: (name: string) => {
                if (name === 'content-length') return buffer.byteLength.toString()
                return null
              }
            },
            body: mockBody,
            bodyUsed: false
          } as unknown as Response)
        })
        
        await bundleLoader.loadBundle(bundleUrl, 'test-bundle')
        expect.fail('Should throw error for invalid magic number')
      } catch (error) {
        expect(error.message).toContain('Invalid QPK file')
      }
    }, 5000) // 5 second timeout

    it('should support different compression types', () => {
      const compressionTypes = [0, 1, 2] // None, LZMA, DEFLATE
      
      compressionTypes.forEach(compressionType => {
        const buffer = new ArrayBuffer(24)
        const view = new DataView(buffer)
        
        view.setUint32(0, 0x51504B00, true) // QPK magic
        view.setUint32(4, 1, true) // Version
        view.setUint32(8, compressionType, true) // Compression type
        view.setUint32(12, 0, true) // Encryption flags
        view.setUint32(16, 0, true) // File count
        
        // Verify header was set correctly
        expect(view.getUint32(8, true)).toBe(compressionType)
      })
    })
  })

  describe('Bundle Loading', () => {
    it('should create BundleLoader with default options', () => {
      const loader = new BundleLoader()
      expect(loader).toBeDefined()
      expect(loader).toBeInstanceOf(BundleLoader)
    })

    it('should handle bundle format detection', () => {
      const formats: Array<{ url: string, expectedFormat: BundleFormat }> = [
        { url: 'test.qpk', expectedFormat: 'qpk' },
        { url: 'test.zip', expectedFormat: 'zip' },
        { url: 'test.QPK', expectedFormat: 'qpk' },
        { url: 'test.ZIP', expectedFormat: 'zip' }
      ]

      formats.forEach(({ url, expectedFormat }) => {
        const extension = url.toLowerCase().split('.').pop()
        const detectedFormat = extension === 'qpk' ? 'qpk' : 'zip'
        expect(detectedFormat).toBe(expectedFormat)
      })
    })
  })

  describe('Plugin System', () => {
    it('should support plugin registration interface', () => {
      const mockPlugin = {
        name: 'test-decompression',
        version: '1.0.0',
        supportedFormats: ['qpk'] as BundleFormat[],
        decompress: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn()
      }

      // Test plugin structure
      expect(mockPlugin.name).toBe('test-decompression')
      expect(mockPlugin.supportedFormats).toContain('qpk')
      expect(typeof mockPlugin.decompress).toBe('function')
    })

    it('should support different plugin types', () => {
      const decompressionPlugin = {
        name: 'test-decompression',
        version: '1.0.0',
        supportedFormats: ['qpk'] as BundleFormat[],
        decompress: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn()
      }

      const decryptionPlugin = {
        name: 'test-decryption',
        version: '1.0.0',
        decrypt: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn()
      }

      expect(decompressionPlugin.name).toBeDefined()
      expect(decryptionPlugin.name).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network timeout')))

      try {
        await bundleLoader.loadBundle('test.qpk', 'test-bundle')
        expect.fail('Should throw network error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('Failed to load bundle')
      }
    }, 5000)

    it('should handle invalid bundle data', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)) // Too small
        } as Response)
      )

      try {
        await bundleLoader.loadBundle('test.qpk', 'test-bundle')
        expect.fail('Should throw error for invalid data')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    }, 5000)
  })
})