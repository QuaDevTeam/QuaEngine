import type { AudioMetadata, ImageMetadata, VideoMetadata } from '../src/core/types'
import { Buffer } from 'node:buffer'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  WebMOutputFormat,
} from 'mediabunny'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { MediaMetadataExtractor } from '../src/assets/media-extractor'

describe('mediaMetadataExtractor', () => {
  let extractor: MediaMetadataExtractor
  const testDir = join(tmpdir(), `quack-media-assets-${Date.now()}`)

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
        0x00, // CRC bytes are not used by the metadata parser
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
    it('should extract MP3 metadata from complete CBR frames', async () => {
      const mp3Data = createMp3CbrFixture({ frames: 6 })

      const testFile = join(testDir, 'test.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBeCloseTo((6 * 1152) / 44100, 5)
      expect(metadata.bitrate).toBeGreaterThan(120000)
      expect(metadata.bitrate).toBeLessThan(132000)
      expect(metadata.sampleRate).toBe(44100)
      expect(metadata.channels).toBe(2)
    })

    it('should return format-only metadata for malformed Xing MP3 data', async () => {
      const mp3Data = createMp3CbrFixture({ frames: 1, xingFrames: 120, xingBytes: 48000 })
      const testFile = join(testDir, 'xing.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBe(0)
      expect(metadata.bitrate).toBeUndefined()
      expect(metadata.sampleRate).toBeUndefined()
    })

    it('should return format-only metadata for malformed VBRI MP3 data', async () => {
      const mp3Data = createMp3CbrFixture({ frames: 1, vbriFrames: 80, vbriBytes: 32000 })
      const testFile = join(testDir, 'vbri.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBe(0)
      expect(metadata.bitrate).toBeUndefined()
    })

    it('should skip ID3 tags when parsing MP3 frames', async () => {
      const mp3Data = Buffer.concat([
        createId3v2Tag(Buffer.from('quack!')),
        createMp3CbrFixture({ frames: 4 }),
        createId3v1Tag(),
      ])
      const testFile = join(testDir, 'tagged.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.duration).toBeCloseTo((4 * 1152) / 44100, 5)
      expect(metadata.sampleRate).toBe(44100)
    })

    it('should skip large ID3 tags before MP3 frames', async () => {
      const mp3Data = Buffer.concat([
        createId3v2Tag(Buffer.alloc(8192)),
        createMp3CbrFixture({ frames: 4 }),
      ])
      const testFile = join(testDir, 'large-tag.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.duration).toBeCloseTo((4 * 1152) / 44100, 5)
      expect(metadata.sampleRate).toBe(44100)
      expect(metadata.channels).toBe(2)
    })

    it('should not invent duration from a single fake MP3 frame header', async () => {
      const mp3Data = Buffer.alloc(1024)
      mp3Data[0] = 0xFF
      mp3Data[1] = 0xFB
      mp3Data[2] = 0x90
      mp3Data[3] = 0x64

      const testFile = join(testDir, 'fake.mp3')
      writeFileSync(testFile, mp3Data)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('MP3')
      expect(metadata.duration).toBe(0)
      expect(metadata.bitrate).toBeUndefined()
      expect(metadata.sampleRate).toBeUndefined()
    })
  })

  describe('additional Audio Container Metadata', () => {
    it('should extract WAV metadata when chunks are not at fixed offsets', async () => {
      const wavData = createWavFixture({ durationSeconds: 2, sampleRate: 48000, channels: 1, junkBeforeFmt: true })
      const testFile = join(testDir, 'chunked.wav')
      writeFileSync(testFile, wavData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('WAV')
      expect(metadata.duration).toBe(2)
      expect(metadata.sampleRate).toBe(48000)
      expect(metadata.channels).toBe(1)
    })

    it('should extract M4A metadata from the audio track', async () => {
      const m4aData = await createMp4Fixture({ durationSeconds: 3, audioOnly: true, sampleRate: 48000, channels: 2 })
      const testFile = join(testDir, 'voice.m4a')
      writeFileSync(testFile, m4aData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('M4A')
      expect(metadata.duration).toBeCloseTo(3, 1)
      expect(metadata.sampleRate).toBe(48000)
      expect(metadata.channels).toBe(2)
    })

    it('should return format-only metadata for malformed FLAC data', async () => {
      const flacData = Buffer.alloc(64)
      const testFile = join(testDir, 'theme.flac')
      writeFileSync(testFile, flacData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('FLAC')
      expect(metadata.duration).toBe(0)
      expect(metadata.sampleRate).toBeUndefined()
      expect(metadata.channels).toBeUndefined()
    })

    it('should extract AAC ADTS duration from full frames', async () => {
      const aacData = Buffer.concat([
        createAdtsFrame(),
        createAdtsFrame(),
        createAdtsFrame(),
        createAdtsFrame(),
      ])
      const testFile = join(testDir, 'sfx.aac')
      writeFileSync(testFile, aacData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('AAC')
      expect(metadata.duration).toBeCloseTo((4 * 1024) / 44100, 5)
      expect(metadata.sampleRate).toBe(44100)
      expect(metadata.channels).toBe(2)
    })

    it('should extract OGG Opus duration and channel metadata', async () => {
      const oggData = await createOggOpusFixture({ durationSeconds: 1, sampleRate: 48000, channels: 2 })
      const testFile = join(testDir, 'loop.ogg')
      writeFileSync(testFile, oggData)

      const metadata = await extractor.extractMetadata(testFile) as AudioMetadata

      expect(metadata.format).toBe('OGG')
      expect(metadata.duration).toBeGreaterThan(0)
      expect(metadata.sampleRate).toBe(48000)
      expect(metadata.channels).toBe(2)
    })
  })

  describe('video File Detection', () => {
    it('should detect video files and return basic metadata', async () => {
      const mp4Data = await createMp4Fixture({ width: 1280, height: 720, durationSeconds: 12, frameRate: 24 })
      const testFile = join(testDir, 'test.mp4')
      writeFileSync(testFile, mp4Data)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata).toBeDefined()
      expect(metadata.format).toBe('MP4')
      expect(metadata.width).toBe(1280)
      expect(metadata.height).toBe(720)
      expect(metadata.aspectRatio).toBeCloseTo(16 / 9)
      expect(metadata.duration).toBeCloseTo(12, 5)
      expect(metadata.hasAudio).toBe(true)
      expect(metadata.codec).toBe('avc1')
      expect(metadata.frameRate).toBe(24)
    })

    it('should use the video track when the audio track appears first in MP4', async () => {
      const mp4Data = await createMp4Fixture({ width: 1024, height: 576, durationSeconds: 4, audioFirst: true })
      const testFile = join(testDir, 'audio-first.mp4')
      writeFileSync(testFile, mp4Data)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata.width).toBe(1024)
      expect(metadata.height).toBe(576)
      expect(metadata.duration).toBeCloseTo(4, 5)
      expect(metadata.hasAudio).toBe(true)
    })

    it('should extract WebM track dimensions and codec', async () => {
      const webmData = await createWebMFixture({ width: 1920, height: 1080, durationSeconds: 7.5, frameRate: 30 })
      const testFile = join(testDir, 'intro.webm')
      writeFileSync(testFile, webmData)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata.format).toBe('WEBM')
      expect(metadata.width).toBe(1920)
      expect(metadata.height).toBe(1080)
      expect(metadata.duration).toBeCloseTo(7.5, 1)
      expect(metadata.codec).toBe('V_VP9')
      expect(metadata.frameRate).toBeCloseTo(30, 1)
      expect(metadata.hasAudio).toBe(true)
    })

    it('should extract AVI RIFF stream metadata', async () => {
      const aviData = createAviFixture({ width: 640, height: 360, frameRate: 24, frames: 120, codec: 'MJPG', hasAudio: true })
      const testFile = join(testDir, 'cutscene.avi')
      writeFileSync(testFile, aviData)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata.format).toBe('AVI')
      expect(metadata.width).toBe(640)
      expect(metadata.height).toBe(360)
      expect(metadata.aspectRatio).toBeCloseTo(16 / 9)
      expect(metadata.duration).toBeCloseTo(5, 4)
      expect(metadata.frameRate).toBeCloseTo(24, 4)
      expect(metadata.codec).toBe('MJPG')
      expect(metadata.hasAudio).toBe(true)
    })

    it('should extract FLV script metadata and audio presence', async () => {
      const flvData = createFlvFixture({ width: 640, height: 360, durationSeconds: 4.5, frameRate: 30, codecId: 7, hasAudio: true })
      const testFile = join(testDir, 'cutscene.flv')
      writeFileSync(testFile, flvData)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata.format).toBe('FLV')
      expect(metadata.width).toBe(640)
      expect(metadata.height).toBe(360)
      expect(metadata.duration).toBeCloseTo(4.5, 5)
      expect(metadata.frameRate).toBe(30)
      expect(metadata.codec).toBe('AVC')
      expect(metadata.hasAudio).toBe(true)
    })

    it('should extract WMV/ASF stream metadata', async () => {
      const wmvData = createAsfFixture({ width: 1280, height: 720, durationSeconds: 6, frameRate: 24, codec: 'WMV3', hasAudio: true })
      const testFile = join(testDir, 'cutscene.wmv')
      writeFileSync(testFile, wmvData)

      const metadata = await extractor.extractMetadata(testFile) as VideoMetadata

      expect(metadata.format).toBe('WMV')
      expect(metadata.width).toBe(1280)
      expect(metadata.height).toBe(720)
      expect(metadata.duration).toBeCloseTo(6, 5)
      expect(metadata.frameRate).toBeCloseTo(24, 4)
      expect(metadata.codec).toBe('WMV3')
      expect(metadata.hasAudio).toBe(true)
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
      const extensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.m4v', '.wmv', '.flv']

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
        // Create a PNG fixture with specific dimensions.
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

function createMp3CbrFixture(options: { frames: number, xingFrames?: number, xingBytes?: number, vbriFrames?: number, vbriBytes?: number }): Buffer {
  const frames = Array.from({ length: options.frames }, () => createMp3Frame())
  const firstFrame = frames[0]
  if (firstFrame && options.xingFrames) {
    firstFrame.write('Xing', 36, 'ascii')
    firstFrame.writeUInt32BE(options.xingBytes ? 0x03 : 0x01, 40)
    firstFrame.writeUInt32BE(options.xingFrames, 44)
    if (options.xingBytes) {
      firstFrame.writeUInt32BE(options.xingBytes, 48)
    }
  }
  if (firstFrame && options.vbriFrames) {
    firstFrame.write('VBRI', 36, 'ascii')
    firstFrame.writeUInt32BE(options.vbriBytes || firstFrame.length * options.vbriFrames, 46)
    firstFrame.writeUInt32BE(options.vbriFrames, 50)
  }
  return Buffer.concat(frames)
}

function createMp3Frame(): Buffer {
  const frame = Buffer.alloc(417)
  frame[0] = 0xFF
  frame[1] = 0xFB
  frame[2] = 0x90
  frame[3] = 0x64
  return frame
}

function createId3v2Tag(body: Buffer): Buffer {
  const header = Buffer.alloc(10)
  header.write('ID3', 0, 'ascii')
  header[3] = 4
  header[6] = (body.length >> 21) & 0x7F
  header[7] = (body.length >> 14) & 0x7F
  header[8] = (body.length >> 7) & 0x7F
  header[9] = body.length & 0x7F
  return Buffer.concat([header, body])
}

function createId3v1Tag(): Buffer {
  const tag = Buffer.alloc(128)
  tag.write('TAG', 0, 'ascii')
  return tag
}

function createWavFixture(options: { durationSeconds: number, sampleRate: number, channels: number, junkBeforeFmt?: boolean }): Buffer {
  const bitsPerSample = 16
  const blockAlign = options.channels * (bitsPerSample / 8)
  const byteRate = options.sampleRate * blockAlign
  const dataSize = Math.round(options.durationSeconds * byteRate)
  const fmt = riffChunk('fmt ', Buffer.concat([
    uint16le(1),
    uint16le(options.channels),
    uint32le(options.sampleRate),
    uint32le(byteRate),
    uint16le(blockAlign),
    uint16le(bitsPerSample),
  ]))
  const data = riffChunk('data', Buffer.alloc(dataSize))
  const chunks = options.junkBeforeFmt
    ? [riffChunk('JUNK', Buffer.alloc(5)), fmt, data]
    : [fmt, data]
  const wavePayload = Buffer.concat([Buffer.from('WAVE'), ...chunks])
  return Buffer.concat([Buffer.from('RIFF'), uint32le(wavePayload.length), wavePayload])
}

async function createMp4Fixture(options: {
  width?: number
  height?: number
  durationSeconds: number
  frameRate?: number
  hasAudio?: boolean
  audioFirst?: boolean
  audioOnly?: boolean
  sampleRate?: number
  channels?: number
}): Promise<Buffer> {
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const videoSource = options.audioOnly ? undefined : new EncodedVideoPacketSource('avc')
  const audioSource = options.hasAudio === false ? undefined : new EncodedAudioPacketSource('aac')

  const addVideoTrack = (): void => {
    if (videoSource) {
      output.addVideoTrack(videoSource, { frameRate: options.frameRate ?? 24 })
    }
  }
  const addAudioTrack = (): void => {
    if (audioSource) {
      output.addAudioTrack(audioSource)
    }
  }

  if (options.audioFirst) {
    addAudioTrack()
    addVideoTrack()
  }
  else {
    addVideoTrack()
    addAudioTrack()
  }

  await output.start()

  if (videoSource) {
    const frameRate = options.frameRate ?? 24
    const frameDuration = 1 / frameRate
    const frameCount = Math.max(1, Math.round(options.durationSeconds * frameRate))
    const videoConfig = {
      codec: 'avc1.42001e',
      codedWidth: options.width ?? 1280,
      codedHeight: options.height ?? 720,
      description: new Uint8Array([1, 66, 0, 30, 255, 224, 0]),
    }

    for (let index = 0; index < frameCount; index += 1) {
      await videoSource.add(
        new EncodedPacket(new Uint8Array([0, 0, 0, 0]), 'key', index * frameDuration, frameDuration, index),
        index === 0 ? { decoderConfig: videoConfig } : undefined,
      )
    }
    videoSource.close()
  }

  if (audioSource) {
    const sampleRate = options.sampleRate ?? 44100
    const channels = options.channels ?? 2
    const frameDuration = 1024 / sampleRate
    const audioPacketCount = options.audioOnly
      ? Math.max(1, Math.ceil(options.durationSeconds / frameDuration))
      : 1

    for (let index = 0; index < audioPacketCount; index += 1) {
      await audioSource.add(
        new EncodedPacket(createAdtsFrame({ sampleRate, channels }), 'key', index * frameDuration, frameDuration, index),
        index === 0
          ? { decoderConfig: { codec: 'mp4a.40.2', numberOfChannels: channels, sampleRate } }
          : undefined,
      )
    }
    audioSource.close()
  }

  await output.finalize()
  return Buffer.from(target.buffer ?? new ArrayBuffer(0))
}

async function createWebMFixture(options: { width: number, height: number, durationSeconds: number, frameRate: number }): Promise<Buffer> {
  const target = new BufferTarget()
  const output = new Output({ format: new WebMOutputFormat(), target })
  const videoSource = new EncodedVideoPacketSource('vp9')
  const audioSource = new EncodedAudioPacketSource('opus')

  output.addVideoTrack(videoSource, { frameRate: options.frameRate })
  output.addAudioTrack(audioSource)
  await output.start()

  const frameDuration = 1 / options.frameRate
  const frameCount = Math.max(1, Math.round(options.durationSeconds * options.frameRate))
  const videoConfig = {
    codec: 'vp09.00.10.08',
    codedWidth: options.width,
    codedHeight: options.height,
  }

  for (let index = 0; index < frameCount; index += 1) {
    await videoSource.add(
      new EncodedPacket(new Uint8Array([0]), 'key', index * frameDuration, frameDuration, index),
      index === 0 ? { decoderConfig: videoConfig } : undefined,
    )
  }

  await audioSource.add(
    new EncodedPacket(new Uint8Array([0]), 'key', 0, 0.02, 0),
    { decoderConfig: { codec: 'opus', numberOfChannels: 2, sampleRate: 48000 } },
  )

  videoSource.close()
  audioSource.close()
  await output.finalize()
  return Buffer.from(target.buffer ?? new ArrayBuffer(0))
}

async function createOggOpusFixture(options: { durationSeconds: number, sampleRate: number, channels: number }): Promise<Buffer> {
  const target = new BufferTarget()
  const output = new Output({ format: new OggOutputFormat(), target })
  const audioSource = new EncodedAudioPacketSource('opus')

  output.addAudioTrack(audioSource)
  await output.start()

  const packetDuration = 0.02
  const packetCount = Math.max(1, Math.ceil(options.durationSeconds / packetDuration))
  const decoderConfig = {
    codec: 'opus',
    numberOfChannels: options.channels,
    sampleRate: options.sampleRate,
    description: createOpusHead(options.sampleRate, options.channels),
  }

  for (let index = 0; index < packetCount; index += 1) {
    await audioSource.add(
      new EncodedPacket(new Uint8Array([0]), 'key', index * packetDuration, packetDuration, index),
      index === 0 ? { decoderConfig } : undefined,
    )
  }

  audioSource.close()
  await output.finalize()
  return Buffer.from(target.buffer ?? new ArrayBuffer(0))
}

function createAdtsFrame(options: { payloadSize?: number, sampleRate?: number, channels?: number } = {}): Buffer {
  const payloadSize = options.payloadSize ?? 20
  const sampleRateIndex = getAdtsSampleRateIndex(options.sampleRate ?? 44100)
  const channels = options.channels ?? 2
  const frameLength = 7 + payloadSize
  const frame = Buffer.alloc(frameLength)
  frame[0] = 0xFF
  frame[1] = 0xF1
  frame[2] = (1 << 6) | (sampleRateIndex << 2) | ((channels >> 2) & 0x01)
  frame[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03)
  frame[4] = (frameLength >> 3) & 0xFF
  frame[5] = ((frameLength & 0x07) << 5) | 0x1F
  frame[6] = 0xFC
  return frame
}

function getAdtsSampleRateIndex(sampleRate: number): number {
  const sampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
  const index = sampleRates.indexOf(sampleRate)
  return index === -1 ? 4 : index
}

function createOpusHead(sampleRate: number, channels: number): Uint8Array {
  const description = Buffer.alloc(19)
  description.write('OpusHead', 0, 'ascii')
  description[8] = 1
  description[9] = channels
  description.writeUInt16LE(0, 10)
  description.writeUInt32LE(sampleRate, 12)
  description.writeUInt16LE(0, 16)
  description[18] = 0
  return description
}

function createAviFixture(options: { width: number, height: number, frameRate: number, frames: number, codec: string, hasAudio: boolean }): Buffer {
  const microsecondsPerFrame = Math.round(1_000_000 / options.frameRate)
  const avih = Buffer.alloc(56)
  avih.writeUInt32LE(microsecondsPerFrame, 0)
  avih.writeUInt32LE(options.frames, 16)
  avih.writeUInt32LE(options.hasAudio ? 2 : 1, 24)
  avih.writeUInt32LE(options.width, 32)
  avih.writeUInt32LE(options.height, 36)

  const videoStrh = Buffer.alloc(56)
  videoStrh.write('vids', 0, 'ascii')
  videoStrh.write(options.codec.padEnd(4, '\0').slice(0, 4), 4, 'ascii')
  videoStrh.writeUInt32LE(1, 20)
  videoStrh.writeUInt32LE(options.frameRate, 24)
  videoStrh.writeUInt32LE(options.frames, 32)
  videoStrh.writeInt16LE(options.width, 52)
  videoStrh.writeInt16LE(options.height, 54)

  const videoStrf = Buffer.alloc(40)
  videoStrf.writeUInt32LE(40, 0)
  videoStrf.writeInt32LE(options.width, 4)
  videoStrf.writeInt32LE(options.height, 8)
  videoStrf.writeUInt16LE(1, 12)
  videoStrf.writeUInt16LE(24, 14)
  videoStrf.write(options.codec.padEnd(4, '\0').slice(0, 4), 16, 'ascii')

  const lists = [
    riffChunk('avih', avih),
    riffList('strl', [
      riffChunk('strh', videoStrh),
      riffChunk('strf', videoStrf),
    ]),
  ]

  if (options.hasAudio) {
    const audioStrh = Buffer.alloc(56)
    audioStrh.write('auds', 0, 'ascii')
    const audioStrf = Buffer.alloc(18)
    audioStrf.writeUInt16LE(1, 0)
    audioStrf.writeUInt16LE(2, 2)
    audioStrf.writeUInt32LE(44100, 4)
    audioStrf.writeUInt32LE(176400, 8)
    audioStrf.writeUInt16LE(4, 12)
    audioStrf.writeUInt16LE(16, 14)
    lists.push(riffList('strl', [
      riffChunk('strh', audioStrh),
      riffChunk('strf', audioStrf),
    ]))
  }

  const payload = Buffer.concat([
    Buffer.from('AVI '),
    riffList('hdrl', lists),
  ])
  return Buffer.concat([Buffer.from('RIFF'), uint32le(payload.length), payload])
}

function createFlvFixture(options: { width: number, height: number, durationSeconds: number, frameRate: number, codecId: number, hasAudio: boolean }): Buffer {
  const header = Buffer.from([
    0x46,
    0x4C,
    0x56,
    0x01,
    options.hasAudio ? 0x05 : 0x01,
    0x00,
    0x00,
    0x00,
    0x09,
    0x00,
    0x00,
    0x00,
    0x00,
  ])

  const script = flvTag(18, 0, Buffer.concat([
    amfStringValue('onMetaData'),
    amfEcmaArray({
      duration: options.durationSeconds,
      width: options.width,
      height: options.height,
      framerate: options.frameRate,
      videocodecid: options.codecId,
      audiocodecid: options.hasAudio ? 10 : undefined,
    }),
  ]))
  const video = flvTag(9, Math.round(options.durationSeconds * 1000), Buffer.from([0x10 | options.codecId, 0x01, 0x00, 0x00, 0x00]))
  return Buffer.concat([header, script, video])
}

const ASF_HEADER_OBJECT = Buffer.from([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C])
const ASF_FILE_PROPERTIES_OBJECT = Buffer.from([0xA1, 0xDC, 0xAB, 0x8C, 0x47, 0xA9, 0xCF, 0x11, 0x8E, 0xE4, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])
const ASF_STREAM_PROPERTIES_OBJECT = Buffer.from([0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11, 0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])
const ASF_AUDIO_MEDIA = Buffer.from([0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])
const ASF_VIDEO_MEDIA = Buffer.from([0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])

function createAsfFixture(options: { width: number, height: number, durationSeconds: number, frameRate: number, codec: string, hasAudio: boolean }): Buffer {
  const fileProperties = Buffer.alloc(88)
  asfGuid().copy(fileProperties, 0)
  uint64le(0).copy(fileProperties, 16)
  uint64le(0).copy(fileProperties, 24)
  uint64le(1).copy(fileProperties, 32)
  uint64le(Math.round(options.durationSeconds * 10_000_000)).copy(fileProperties, 40)
  uint64le(Math.round(options.durationSeconds * 10_000_000)).copy(fileProperties, 48)
  uint64le(0).copy(fileProperties, 56)
  fileProperties.writeUInt32LE(2, 64)
  fileProperties.writeUInt32LE(0, 68)
  fileProperties.writeUInt32LE(0, 72)
  fileProperties.writeUInt32LE(2_000_000, 80)

  const videoTypeData = Buffer.alloc(88)
  videoTypeData.writeUInt32LE(2_000_000, 32)
  uint64le(Math.round(10_000_000 / options.frameRate)).copy(videoTypeData, 40)
  videoTypeData.writeUInt32LE(40, 48)
  videoTypeData.writeInt32LE(options.width, 52)
  videoTypeData.writeInt32LE(options.height, 56)
  videoTypeData.writeUInt16LE(1, 60)
  videoTypeData.writeUInt16LE(24, 62)
  videoTypeData.write(options.codec.padEnd(4, '\0').slice(0, 4), 64, 'ascii')

  const videoStream = Buffer.alloc(54 + videoTypeData.length)
  ASF_VIDEO_MEDIA.copy(videoStream, 0)
  videoStream.writeUInt32LE(videoTypeData.length, 40)
  videoStream.writeUInt16LE(1, 48)
  videoTypeData.copy(videoStream, 54)

  const objects = [
    asfObject(ASF_FILE_PROPERTIES_OBJECT, fileProperties),
    asfObject(ASF_STREAM_PROPERTIES_OBJECT, videoStream),
  ]

  if (options.hasAudio) {
    const audioTypeData = Buffer.alloc(18)
    audioTypeData.writeUInt16LE(1, 0)
    audioTypeData.writeUInt16LE(2, 2)
    audioTypeData.writeUInt32LE(44100, 4)
    const audioStream = Buffer.alloc(54 + audioTypeData.length)
    ASF_AUDIO_MEDIA.copy(audioStream, 0)
    audioStream.writeUInt32LE(audioTypeData.length, 40)
    audioStream.writeUInt16LE(2, 48)
    audioTypeData.copy(audioStream, 54)
    objects.push(asfObject(ASF_STREAM_PROPERTIES_OBJECT, audioStream))
  }

  const headerData = Buffer.concat([
    uint32le(objects.length),
    Buffer.from([1, 2]),
    ...objects,
  ])
  return asfObject(ASF_HEADER_OBJECT, headerData)
}

function flvTag(type: number, timestamp: number, data: Buffer): Buffer {
  const header = Buffer.alloc(11)
  header[0] = type
  writeUInt24BE(header, data.length, 1)
  writeUInt24BE(header, timestamp & 0xFFFFFF, 4)
  header[7] = (timestamp >> 24) & 0xFF
  return Buffer.concat([header, data, uint32be(header.length + data.length)])
}

function amfStringValue(value: string): Buffer {
  const text = Buffer.from(value)
  return Buffer.concat([Buffer.from([2]), uint16be(text.length), text])
}

function amfEcmaArray(values: Record<string, number | undefined>): Buffer {
  const entries = Object.entries(values)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(([key, value]) => {
      const keyBytes = Buffer.from(key)
      const number = Buffer.alloc(8)
      number.writeDoubleBE(value)
      return Buffer.concat([uint16be(keyBytes.length), keyBytes, Buffer.from([0]), number])
    })
  return Buffer.concat([Buffer.from([8]), uint32be(entries.length), ...entries, Buffer.from([0, 0, 9])])
}

function asfObject(guid: Buffer, data: Buffer): Buffer {
  return Buffer.concat([guid, uint64le(24 + data.length), data])
}

function asfGuid(): Buffer {
  return Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00])
}

function uint16le(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint16be(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16BE(value)
  return buffer
}

function uint32le(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

function uint32be(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}

function uint64le(value: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(BigInt(value))
  return buffer
}

function writeUInt24BE(buffer: Buffer, value: number, offset: number): void {
  buffer[offset] = (value >> 16) & 0xFF
  buffer[offset + 1] = (value >> 8) & 0xFF
  buffer[offset + 2] = value & 0xFF
}

function riffChunk(id: string, payload: Buffer): Buffer {
  const padding = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)
  return Buffer.concat([Buffer.from(id), uint32le(payload.length), payload, padding])
}

function riffList(type: string, chunks: Buffer[]): Buffer {
  return riffChunk('LIST', Buffer.concat([Buffer.from(type), ...chunks]))
}
