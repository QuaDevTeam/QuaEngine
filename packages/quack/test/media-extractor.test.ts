import type { AudioMetadata, ImageMetadata, VideoMetadata } from '../src/core/types'
import { Buffer } from 'node:buffer'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { MediaMetadataExtractor } from '../src/assets/media-extractor'

describe('mediaMetadataExtractor', () => {
  let extractor: MediaMetadataExtractor
  const testDir = join(process.cwd(), 'test-assets')

  beforeEach(() => {
    extractor = new MediaMetadataExtractor()

    // Create test directory
    try {
      mkdirSync(testDir, { recursive: true })
    }
    catch {
      // Directory already exists
    }
  })

  afterAll(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true })
    }
    catch {
      // Directory doesn't exist or can't be removed
    }
  })

  describe('pNG Image Metadata', () => {
    it('should extract PNG metadata correctly', async () => {
      // Create a minimal valid PNG file (1x1 pixel, RGB)
      const pngData = Buffer.from([
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A, // PNG signature
        0x00,
        0x00,
        0x00,
        0x0D, // IHDR chunk length (13)
        0x49,
        0x48,
        0x44,
        0x52, // IHDR
        0x00,
        0x00,
        0x00,
        0x64, // Width: 100
        0x00,
        0x00,
        0x00,
        0x32, // Height: 50
        0x08, // Bit depth: 8
        0x02, // Color type: RGB (2)
        0x00,
        0x00,
        0x00, // Compression, filter, interlace
        0x00,
        0x00,
        0x00,
        0x00, // CRC (placeholder)
        0x00,
        0x00,
        0x00,
        0x00, // IEND chunk
        0x49,
        0x45,
        0x4E,
        0x44,
        0x00,
        0x00,
        0x00,
        0x00,
      ])

      const testFile = join(testDir, 'test.png')
      writeFileSync(testFile, pngData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata).toBeDefined()
      expect(metadata.width).toBe(100)
      expect(metadata.height).toBe(50)
      expect(metadata.aspectRatio).toBe(2) // 100/50 = 2
      expect(metadata.format).toBe('PNG')
      expect(metadata.animated).toBe(false)
      expect(metadata.hasAlpha).toBe(false)
      expect(metadata.colorDepth).toBe(8)
    })

    it('should detect PNG with alpha channel', async () => {
      // Create PNG with alpha (color type 6)
      const pngData = Buffer.from([
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A, // PNG signature
        0x00,
        0x00,
        0x00,
        0x0D, // IHDR chunk length
        0x49,
        0x48,
        0x44,
        0x52, // IHDR
        0x00,
        0x00,
        0x00,
        0x10, // Width: 16
        0x00,
        0x00,
        0x00,
        0x10, // Height: 16
        0x08, // Bit depth: 8
        0x06, // Color type: RGBA (6)
        0x00,
        0x00,
        0x00, // Compression, filter, interlace
        0x00,
        0x00,
        0x00,
        0x00, // CRC
        0x00,
        0x00,
        0x00,
        0x00, // IEND
        0x49,
        0x45,
        0x4E,
        0x44,
        0x00,
        0x00,
        0x00,
        0x00,
      ])

      const testFile = join(testDir, 'alpha.png')
      writeFileSync(testFile, pngData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata.hasAlpha).toBe(true)
      expect(metadata.aspectRatio).toBe(1) // Square image
    })
  })

  describe('jPEG Image Metadata', () => {
    it('should extract JPEG metadata correctly', async () => {
      // Create a minimal JPEG with SOF0 marker
      const jpegData = Buffer.from([
        0xFF,
        0xD8, // JPEG signature
        0xFF,
        0xE0,
        0x00,
        0x10, // APP0 marker
        0x4A,
        0x46,
        0x49,
        0x46,
        0x00, // JFIF identifier
        0x01,
        0x01,
        0x01,
        0x00,
        0x48,
        0x00,
        0x48,
        0x00,
        0x00,
        0xFF,
        0xC0,
        0x00,
        0x11, // SOF0 marker and length
        0x08, // Precision
        0x01,
        0x2C, // Height: 300
        0x01,
        0x90, // Width: 400
        0x03, // Number of components
        0x01,
        0x22,
        0x00,
        0x02,
        0x11,
        0x01,
        0x03,
        0x11,
        0x01,
        0xFF,
        0xD9, // End of image
      ])

      const testFile = join(testDir, 'test.jpg')
      writeFileSync(testFile, jpegData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata).toBeDefined()
      expect(metadata.width).toBe(400)
      expect(metadata.height).toBe(300)
      expect(metadata.aspectRatio).toBe(400 / 300)
      expect(metadata.format).toBe('JPEG')
      expect(metadata.animated).toBe(false)
      expect(metadata.hasAlpha).toBe(false)
    })
  })

  describe('gIF Image Metadata', () => {
    it('should extract GIF metadata and detect non-animated', async () => {
      // Create a minimal GIF87a
      const gifData = Buffer.from([
        0x47,
        0x49,
        0x46,
        0x38,
        0x37,
        0x61, // GIF87a signature
        0x20,
        0x00, // Width: 32 (little-endian)
        0x40,
        0x00, // Height: 64 (little-endian)
        0x00,
        0x00,
        0x00, // Global color table info
        0x2C, // Image descriptor
        0x00,
        0x00,
        0x00,
        0x00,
        0x20,
        0x00,
        0x40,
        0x00,
        0x00,
        0x00,
        0x3B, // Trailer
      ])

      const testFile = join(testDir, 'test.gif')
      writeFileSync(testFile, gifData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata.width).toBe(32)
      expect(metadata.height).toBe(64)
      expect(metadata.aspectRatio).toBe(0.5)
      expect(metadata.format).toBe('GIF')
      expect(metadata.animated).toBe(false)
      expect(metadata.hasAlpha).toBe(true) // GIF supports transparency
    })

    it('should detect animated GIF', async () => {
      // Create GIF with multiple image descriptors
      const gifData = Buffer.from([
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61, // GIF89a signature
        0x10,
        0x00,
        0x10,
        0x00, // 16x16
        0x00,
        0x00,
        0x00,
        0x2C,
        0x00,
        0x00,
        0x00,
        0x00,
        0x10,
        0x00,
        0x10,
        0x00,
        0x00,
        0x00, // First image
        0x2C,
        0x00,
        0x00,
        0x00,
        0x00,
        0x10,
        0x00,
        0x10,
        0x00,
        0x00,
        0x00, // Second image
        0x3B,
      ])

      const testFile = join(testDir, 'animated.gif')
      writeFileSync(testFile, gifData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata.animated).toBe(true)
    })
  })

  describe('webP Image Metadata', () => {
    it('should extract WebP VP8 metadata', async () => {
      // Create minimal WebP VP8
      const webpData = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x1A,
        0x00,
        0x00,
        0x00, // File size
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
        0x56,
        0x50,
        0x38,
        0x20, // VP8 chunk
        0x0E,
        0x00,
        0x00,
        0x00, // Chunk size
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00, // VP8 data
        0x4F,
        0x00, // Width bits (80-1 = 79)
        0x4F,
        0x00, // Height bits (80-1 = 79)
        0x00,
        0x00,
      ])

      const testFile = join(testDir, 'test.webp')
      writeFileSync(testFile, webpData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata.format).toBe('WebP')
      expect(metadata.animated).toBe(false)
    })

    it('should detect animated WebP', async () => {
      // Create WebP with VP8X and animation flag
      const webpData = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x20,
        0x00,
        0x00,
        0x00, // File size
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
        0x56,
        0x50,
        0x38,
        0x58, // VP8X chunk
        0x0A,
        0x00,
        0x00,
        0x00, // Chunk size
        0x12,
        0x00,
        0x00,
        0x00, // Flags (animation bit set)
        0x3F,
        0x00,
        0x00, // Width-1: 63
        0x3F,
        0x00,
        0x00, // Height-1: 63
        0x00,
        0x00,
        0x00,
        0x00,
      ])

      const testFile = join(testDir, 'animated.webp')
      writeFileSync(testFile, webpData)

      const metadata = await extractor.extractMetadata(testFile) as ImageMetadata

      expect(metadata.animated).toBe(true)
      expect(metadata.width).toBe(64)
      expect(metadata.height).toBe(64)
    })
  })

  describe('wAV Audio Metadata', () => {
    it('should extract WAV metadata correctly', async () => {
      // Create minimal WAV file
      const wavData = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x24,
        0x00,
        0x00,
        0x00, // File size
        0x57,
        0x41,
        0x56,
        0x45, // WAVE
        0x66,
        0x6D,
        0x74,
        0x20, // fmt chunk
        0x10,
        0x00,
        0x00,
        0x00, // Chunk size
        0x01,
        0x00, // Audio format (PCM)
        0x02,
        0x00, // Channels: 2
        0x44,
        0xAC,
        0x00,
        0x00, // Sample rate: 44100
        0x10,
        0xB1,
        0x02,
        0x00, // Byte rate
        0x04,
        0x00, // Block align
        0x10,
        0x00, // Bits per sample
        0x64,
        0x61,
        0x74,
        0x61, // data chunk
        0x00,
        0x00,
        0x00,
        0x00, // Data size
      ])

      const testFile = join(testDir, 'test.wav')
      writeFileSync(testFile, wavData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata).toBeDefined()
      expect(metadata.format).toBe('WAV')
      expect(metadata.sampleRate).toBe(44100)
      expect(metadata.channels).toBe(2)
      expect(metadata.duration).toBe(0) // No actual audio data
    })
  })

  describe('mP3 Audio Metadata', () => {
    it('should extract MP3 metadata (estimated)', async () => {
      // Create minimal MP3-like data (just for testing format detection)
      const mp3Data = Buffer.alloc(1024) // 1KB file
      mp3Data[0] = 0xFF // MP3 frame sync
      mp3Data[1] = 0xFB

      const testFile = join(testDir, 'test.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBeGreaterThan(0)
      expect(metadata.bitrate).toBe(128000) // Default estimate
      expect(metadata.sampleRate).toBe(44100) // Default estimate
    })
  })

  describe('video File Detection', () => {
    it('should detect video files and return basic metadata', async () => {
      const mp4Data = Buffer.alloc(100) // Minimal data for format detection
      const testFile = join(testDir, 'test.mp4')
      writeFileSync(testFile, mp4Data)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata).toBeDefined()
      expect(metadata.format).toBe('MP4')
      expect(metadata.width).toBe(0) // Not implemented yet
      expect(metadata.height).toBe(0) // Not implemented yet
      expect(metadata.duration).toBe(0) // Not implemented yet
    })
  })

  describe('unsupported Files', () => {
    it('should return null for unsupported file types', async () => {
      const txtData = Buffer.from('Hello World')
      const testFile = join(testDir, 'test.txt')
      writeFileSync(testFile, txtData)

      const metadata = await extractor.extractMetadata(testFile)

      expect(metadata).toBeNull()
    })

    it('should handle corrupted files gracefully', async () => {
      const corruptedData = Buffer.from([0x00, 0x01, 0x02]) // Invalid PNG
      const testFile = join(testDir, 'corrupted.png')
      writeFileSync(testFile, corruptedData)

      const metadata = await extractor.extractMetadata(testFile)

      // Should return basic metadata with zeros for invalid files
      expect(metadata).toBeDefined()
      expect((metadata as ImageMetadata).width).toBe(0)
      expect((metadata as ImageMetadata).height).toBe(0)
    })
  })

  describe('file Type Detection', () => {
    it('should correctly identify image file extensions', async () => {
      const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']

      for (const ext of extensions) {
        const testFile = join(testDir, `test${ext}`)
        const data = Buffer.alloc(100)
        writeFileSync(testFile, data)

        // Just test that it attempts to extract (won't be valid data)
        const metadata = await extractor.extractMetadata(testFile)
        expect(metadata).toBeDefined()
      }
    })

    it('should correctly identify audio file extensions', async () => {
      const extensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']

      for (const ext of extensions) {
        const testFile = join(testDir, `test${ext}`)
        const data = Buffer.alloc(100)
        writeFileSync(testFile, data)

        const metadata = await extractor.extractMetadata(testFile)
        expect(metadata).toBeDefined()
      }
    })

    it('should correctly identify video file extensions', async () => {
      const extensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv']

      for (const ext of extensions) {
        const testFile = join(testDir, `test${ext}`)
        const data = Buffer.alloc(100)
        writeFileSync(testFile, data)

        const metadata = await extractor.extractMetadata(testFile)
        expect(metadata).toBeDefined()
        expect((metadata as VideoMetadata).format).toBe(ext.substring(1).toUpperCase())
      }
    })
  })

  describe('aspect Ratio Calculations', () => {
    it('should calculate aspect ratios correctly', async () => {
      const testCases = [
        { width: 1920, height: 1080, expected: 16 / 9 },
        { width: 1280, height: 720, expected: 16 / 9 },
        { width: 800, height: 600, expected: 4 / 3 },
        { width: 1024, height: 1024, expected: 1 },
        { width: 0, height: 100, expected: 0 }, // Edge case
        { width: 100, height: 0, expected: 0 }, // Edge case
      ]

      for (const testCase of testCases) {
        // Create a mock PNG with specific dimensions
        const pngData = Buffer.from([
          0x89,
          0x50,
          0x4E,
          0x47,
          0x0D,
          0x0A,
          0x1A,
          0x0A,
          0x00,
          0x00,
          0x00,
          0x0D,
          0x49,
          0x48,
          0x44,
          0x52,
          ...Buffer.from([(testCase.width >> 24) & 0xFF, (testCase.width >> 16) & 0xFF, (testCase.width >> 8) & 0xFF, testCase.width & 0xFF]),
          ...Buffer.from([(testCase.height >> 24) & 0xFF, (testCase.height >> 16) & 0xFF, (testCase.height >> 8) & 0xFF, testCase.height & 0xFF]),
          0x08,
          0x02,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x49,
          0x45,
          0x4E,
          0x44,
          0x00,
          0x00,
          0x00,
          0x00,
        ])

        const testFile = join(testDir, `aspect-${testCase.width}x${testCase.height}.png`)
        writeFileSync(testFile, pngData)

        const metadata = await extractor.extractMetadata(testFile) as ImageMetadata
        expect(metadata.aspectRatio).toBeCloseTo(testCase.expected, 5)
      }
    })
  })
})
