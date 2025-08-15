import type { AudioMetadata, ImageMetadata, VideoMetadata } from '../src/core/types'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AssetDetector } from '../src/assets/asset-detector'

describe('assetDetector with Media Metadata', () => {
  let detector: AssetDetector
  const testDir = join(process.cwd(), 'test-assets-integration')

  beforeEach(() => {
    detector = new AssetDetector()

    // Create test directory structure
    try {
      mkdirSync(join(testDir, 'images'), { recursive: true })
      mkdirSync(join(testDir, 'audio'), { recursive: true })
      mkdirSync(join(testDir, 'video'), { recursive: true })
      mkdirSync(join(testDir, 'characters'), { recursive: true })
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

  describe('image Asset Analysis', () => {
    it('should analyze PNG image with metadata', async () => {
      // Create a valid PNG file
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
        0x0D, // IHDR chunk length (13 bytes)
        0x49,
        0x48,
        0x44,
        0x52, // IHDR chunk type
        0x00,
        0x00,
        0x01,
        0x00, // Width: 256 (big-endian)
        0x00,
        0x00,
        0x00,
        0x80, // Height: 128 (big-endian)
        0x08,
        0x06,
        0x00,
        0x00,
        0x00, // 8-bit depth, RGBA, no compression, no filter, no interlace
        0x8D,
        0xB6,
        0xC5,
        0x2C, // CRC32 checksum (calculated for the IHDR data)
        0x00,
        0x00,
        0x00,
        0x00, // IEND chunk length (0)
        0x49,
        0x45,
        0x4E,
        0x44, // IEND chunk type
        0xAE,
        0x42,
        0x60,
        0x82, // IEND CRC32
      ])

      const testFile = join(testDir, 'images', 'background.png')
      writeFileSync(testFile, pngData)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset).toBeDefined()
      expect(asset!.type).toBe('images')
      expect(asset!.subType).toBe('backgrounds')
      expect(asset!.mediaMetadata).toBeDefined()

      const metadata = asset!.mediaMetadata as ImageMetadata
      expect(metadata.width).toBe(256)
      expect(metadata.height).toBe(128)
      expect(metadata.aspectRatio).toBe(2)
      expect(metadata.format).toBe('PNG')
      expect(metadata.hasAlpha).toBe(true)
      expect(metadata.animated).toBe(false)
    })

    it('should analyze character sprite with metadata', async () => {
      const testFile = join(testDir, 'characters', 'alice', 'normal.png')
      mkdirSync(join(testDir, 'characters', 'alice'), { recursive: true })

      // Simple PNG data
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
        0x0D, // IHDR chunk length (13 bytes)
        0x49,
        0x48,
        0x44,
        0x52, // IHDR chunk type
        0x00,
        0x00,
        0x01,
        0x00, // Width: 256 (big-endian)
        0x00,
        0x00,
        0x02,
        0x00, // Height: 512 (big-endian)
        0x08,
        0x02,
        0x00,
        0x00,
        0x00, // 8-bit depth, RGB, no compression, no filter, no interlace
        0x5C,
        0xF9,
        0x78,
        0x39, // CRC32 checksum
        0x00,
        0x00,
        0x00,
        0x00, // IEND chunk length (0)
        0x49,
        0x45,
        0x4E,
        0x44, // IEND chunk type
        0xAE,
        0x42,
        0x60,
        0x82, // IEND CRC32
      ])
      writeFileSync(testFile, pngData)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset!.type).toBe('characters')
      expect(asset!.subType).toBe('sprites')

      const metadata = asset!.mediaMetadata as ImageMetadata
      expect(metadata.width).toBe(256)
      expect(metadata.height).toBe(512)
      expect(metadata.aspectRatio).toBe(0.5)
    })
  })

  describe('audio Asset Analysis', () => {
    it('should analyze WAV audio with metadata', async () => {
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
        0x00,
        0x02,
        0x00, // PCM, stereo
        0x44,
        0xAC,
        0x00,
        0x00, // 44100 Hz
        0x10,
        0xB1,
        0x02,
        0x00, // Byte rate
        0x04,
        0x00,
        0x10,
        0x00, // Block align, bits per sample
        0x64,
        0x61,
        0x74,
        0x61, // data chunk
        0x00,
        0x00,
        0x00,
        0x00, // Data size
      ])

      const testFile = join(testDir, 'audio', 'bgm', 'theme.wav')
      mkdirSync(join(testDir, 'audio', 'bgm'), { recursive: true })
      writeFileSync(testFile, wavData)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset!.type).toBe('audio')
      expect(asset!.subType).toBe('bgm')
      expect(asset!.mediaMetadata).toBeDefined()

      const metadata = asset!.mediaMetadata as AudioMetadata
      expect(metadata.format).toBe('WAV')
      expect(metadata.sampleRate).toBe(44100)
      expect(metadata.channels).toBe(2)
    })

    it('should analyze MP3 audio with estimated metadata', async () => {
      const mp3Data = Buffer.alloc(2048) // 2KB file for better duration estimate
      const testFile = join(testDir, 'audio', 'voice', 'dialogue.mp3')
      mkdirSync(join(testDir, 'audio', 'voice'), { recursive: true })
      writeFileSync(testFile, mp3Data)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset!.type).toBe('audio')
      expect(asset!.subType).toBe('voice')

      const metadata = asset!.mediaMetadata as AudioMetadata
      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBeGreaterThan(0)
    })
  })

  describe('video Asset Analysis', () => {
    it('should analyze video file with basic metadata', async () => {
      const mp4Data = Buffer.alloc(1024)
      const testFile = join(testDir, 'video', 'cutscenes', 'intro.mp4')
      mkdirSync(join(testDir, 'video', 'cutscenes'), { recursive: true })
      writeFileSync(testFile, mp4Data)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset!.type).toBe('video')
      expect(asset!.subType).toBe('cutscenes')
      expect(asset!.mediaMetadata).toBeDefined()

      const metadata = asset!.mediaMetadata as VideoMetadata
      expect(metadata.format).toBe('MP4')
      expect(metadata.width).toBe(0) // Not implemented yet
      expect(metadata.height).toBe(0) // Not implemented yet
    })

    it('should detect video by file extension', async () => {
      const extensions = ['.mp4', '.webm', '.avi', '.mov']

      for (const ext of extensions) {
        const testFile = join(testDir, 'video', `test${ext}`)
        writeFileSync(testFile, Buffer.alloc(100))

        const asset = await detector.analyzeAsset(testFile, testDir)
        expect(asset!.type).toBe('video')
        expect((asset!.mediaMetadata as VideoMetadata).format).toBe(ext.substring(1).toUpperCase())
      }
    })
  })

  describe('asset Discovery with Media Metadata', () => {
    it('should discover all assets with their media metadata', async () => {
      // Clean up test directory first
      try {
        rmSync(testDir, { recursive: true, force: true })
      }
      catch {
        // Directory doesn't exist
      }

      // Create test directory structure
      mkdirSync(join(testDir, 'images'), { recursive: true })
      mkdirSync(join(testDir, 'audio'), { recursive: true })
      mkdirSync(join(testDir, 'video'), { recursive: true })
      mkdirSync(join(testDir, 'characters'), { recursive: true })
      mkdirSync(join(testDir, 'scripts'), { recursive: true })
      mkdirSync(join(testDir, 'data'), { recursive: true })

      // Create various test files
      const files = [
        { path: 'images/bg01.png', type: 'images', hasMetadata: true },
        { path: 'characters/hero/idle.png', type: 'characters', hasMetadata: true },
        { path: 'audio/bgm/main.mp3', type: 'audio', hasMetadata: true },
        { path: 'video/intro.mp4', type: 'video', hasMetadata: true },
        { path: 'scripts/main.js', type: 'scripts', hasMetadata: false },
        { path: 'data/config.json', type: 'data', hasMetadata: false },
      ]

      for (const file of files) {
        const fullPath = join(testDir, file.path)
        mkdirSync(join(fullPath, '..'), { recursive: true })

        if (file.type === 'images' || file.type === 'characters') {
          // Create minimal PNG
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
            0x00,
            0x00,
            0x00,
            0x10,
            0x00,
            0x00,
            0x00,
            0x10,
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
          writeFileSync(fullPath, pngData)
        }
        else {
          writeFileSync(fullPath, Buffer.alloc(100))
        }
      }

      const assets = await detector.discoverAssets(testDir)

      expect(assets).toHaveLength(files.length)

      // Check that media files have metadata
      const imageAssets = assets.filter(a => a.type === 'images' || a.type === 'characters')
      const audioAssets = assets.filter(a => a.type === 'audio')
      const videoAssets = assets.filter(a => a.type === 'video')
      const otherAssets = assets.filter(a => a.type === 'scripts' || a.type === 'data')

      // All image/character assets should have metadata
      imageAssets.forEach((asset) => {
        expect(asset.mediaMetadata).toBeDefined()
        const metadata = asset.mediaMetadata as ImageMetadata
        expect(metadata.width).toBe(16)
        expect(metadata.height).toBe(16)
      })

      // Audio assets should have metadata
      audioAssets.forEach((asset) => {
        expect(asset.mediaMetadata).toBeDefined()
        expect((asset.mediaMetadata as AudioMetadata).format).toBe('MP3')
      })

      // Video assets should have metadata
      videoAssets.forEach((asset) => {
        expect(asset.mediaMetadata).toBeDefined()
        expect((asset.mediaMetadata as VideoMetadata).format).toBe('MP4')
      })

      // Other assets should not have media metadata
      otherAssets.forEach((asset) => {
        expect(asset.mediaMetadata).toBeUndefined()
      })
    })
  })

  describe('asset Grouping with Video Support', () => {
    it('should group assets including video type', async () => {
      // Clean up test directory first
      try {
        rmSync(testDir, { recursive: true, force: true })
      }
      catch {
        // Directory doesn't exist
      }

      // Create test directory structure
      mkdirSync(join(testDir, 'images'), { recursive: true })
      mkdirSync(join(testDir, 'characters'), { recursive: true })
      mkdirSync(join(testDir, 'audio'), { recursive: true })
      mkdirSync(join(testDir, 'video'), { recursive: true })
      mkdirSync(join(testDir, 'scripts'), { recursive: true })

      // Create test assets
      const testFiles = [
        { path: 'images/bg.png', data: Buffer.alloc(100) },
        { path: 'characters/hero.png', data: Buffer.alloc(100) },
        { path: 'audio/bgm.mp3', data: Buffer.alloc(100) },
        { path: 'video/intro.mp4', data: Buffer.alloc(100) },
        { path: 'scripts/main.js', data: Buffer.from('console.log("hello")') },
      ]

      for (const file of testFiles) {
        const fullPath = join(testDir, file.path)
        mkdirSync(join(fullPath, '..'), { recursive: true })
        writeFileSync(fullPath, file.data)
      }

      const assets = await detector.discoverAssets(testDir)
      const grouped = detector.groupAssets(assets)

      expect(grouped).toHaveProperty('images')
      expect(grouped).toHaveProperty('characters')
      expect(grouped).toHaveProperty('audio')
      expect(grouped).toHaveProperty('video')
      expect(grouped).toHaveProperty('scripts')

      expect(Object.keys(grouped.video)).toHaveLength(1)
      expect(grouped.video.intro).toHaveLength(1)
    })
  })

  describe('error Handling', () => {
    it('should handle media metadata extraction errors gracefully', async () => {
      // Create a file that looks like PNG but is corrupted
      const corruptedPng = Buffer.from([
        0x89,
        0x50,
        0x4E,
        0x47, // PNG signature
        0x00,
        0x01,
        0x02,
        0x03, // Corrupted data
      ])

      const testFile = join(testDir, 'images', 'corrupted.png')
      writeFileSync(testFile, corruptedPng)

      const asset = await detector.analyzeAsset(testFile, testDir)

      expect(asset).toBeDefined()
      expect(asset!.type).toBe('images')
      // Should still have some metadata, even if extraction partially failed
      expect(asset!.mediaMetadata).toBeDefined()
    })

    it('should continue processing other assets if one fails', async () => {
      // Create one valid and one corrupted file
      const validPng = Buffer.from([
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
        0x00,
        0x00,
        0x00,
        0x08,
        0x00,
        0x00,
        0x00,
        0x08,
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

      writeFileSync(join(testDir, 'images', 'valid.png'), validPng)
      writeFileSync(join(testDir, 'images', 'corrupted.png'), Buffer.from([0x89, 0x50]))

      const assets = await detector.discoverAssets(testDir)

      // Both files should be processed, even if one has extraction issues
      expect(assets.length).toBeGreaterThanOrEqual(2)

      const validAsset = assets.find(a => a.name === 'valid.png')
      expect(validAsset).toBeDefined()
      expect(validAsset!.mediaMetadata).toBeDefined()
    })
  })
})
