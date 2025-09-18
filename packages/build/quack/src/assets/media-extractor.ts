import type { AudioMetadata, ImageMetadata, MediaMetadata, VideoMetadata } from '../core/types'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { createLogger } from '@quajs/logger'

const logger = createLogger('quack:media-extractor')

export class MediaMetadataExtractor {
  /**
   * Extract metadata from a media file
   */
  async extractMetadata(filePath: string): Promise<MediaMetadata | null> {
    const ext = extname(filePath).toLowerCase()

    try {
      if (this.isImageFile(ext)) {
        return await this.extractImageMetadata(filePath)
      }
      else if (this.isAudioFile(ext)) {
        return await this.extractAudioMetadata(filePath)
      }
      else if (this.isVideoFile(ext)) {
        return await this.extractVideoMetadata(filePath)
      }
    }
    catch (error) {
      logger.warn(`Failed to extract metadata from ${filePath}:`, error)
    }

    return null
  }

  /**
   * Check if file is an image
   */
  private isImageFile(ext: string): boolean {
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(ext)
  }

  /**
   * Check if file is an audio file
   */
  private isAudioFile(ext: string): boolean {
    return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)
  }

  /**
   * Check if file is a video file
   */
  private isVideoFile(ext: string): boolean {
    return ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'].includes(ext)
  }

  /**
   * Extract image metadata
   */
  private async extractImageMetadata(filePath: string): Promise<ImageMetadata> {
    const buffer = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()

    // Basic metadata that we can extract without external libraries
    const metadata: ImageMetadata = {
      width: 0,
      height: 0,
      aspectRatio: 0,
      animated: false,
      format: this.getImageFormat(ext),
      colorDepth: undefined,
      hasAlpha: undefined,
    }

    // Extract basic dimensions and properties based on file format
    if (ext === '.png') {
      const pngData = this.parsePNG(buffer)
      metadata.width = pngData.width
      metadata.height = pngData.height
      metadata.hasAlpha = pngData.hasAlpha
      metadata.colorDepth = pngData.colorDepth
    }
    else if (ext === '.jpg' || ext === '.jpeg') {
      const jpegData = this.parseJPEG(buffer)
      metadata.width = jpegData.width
      metadata.height = jpegData.height
      metadata.hasAlpha = false
    }
    else if (ext === '.gif') {
      const gifData = this.parseGIF(buffer)
      metadata.width = gifData.width
      metadata.height = gifData.height
      metadata.animated = gifData.animated
      metadata.hasAlpha = true
    }
    else if (ext === '.webp') {
      const webpData = this.parseWebP(buffer)
      metadata.width = webpData.width
      metadata.height = webpData.height
      metadata.animated = webpData.animated
      metadata.hasAlpha = webpData.hasAlpha
    }
    else {
      // For formats we can't parse, provide default values
      metadata.width = 0
      metadata.height = 0
    }

    metadata.aspectRatio = metadata.width > 0 && metadata.height > 0
      ? metadata.width / metadata.height
      : 0

    return metadata
  }

  /**
   * Extract audio metadata (basic implementation)
   */
  private async extractAudioMetadata(filePath: string): Promise<AudioMetadata> {
    const buffer = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()

    const metadata: AudioMetadata = {
      duration: 0,
      format: this.getAudioFormat(ext),
      bitrate: undefined,
      sampleRate: undefined,
      channels: undefined,
    }

    // Basic audio metadata extraction (would need libraries like music-metadata for full implementation)
    if (ext === '.mp3') {
      const mp3Data = this.parseMP3(buffer)
      metadata.duration = mp3Data.duration
      metadata.bitrate = mp3Data.bitrate
      metadata.sampleRate = mp3Data.sampleRate
    }
    else if (ext === '.wav') {
      const wavData = this.parseWAV(buffer)
      metadata.duration = wavData.duration
      metadata.sampleRate = wavData.sampleRate
      metadata.channels = wavData.channels
    }

    return metadata
  }

  /**
   * Extract video metadata (basic implementation)
   */
  private async extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
    const ext = extname(filePath).toLowerCase()

    const metadata: VideoMetadata = {
      width: 0,
      height: 0,
      aspectRatio: 0,
      duration: 0,
      format: this.getVideoFormat(ext),
      frameRate: undefined,
      bitrate: undefined,
      hasAudio: undefined,
      codec: undefined,
    }

    // Video metadata extraction would require libraries like ffprobe or node-ffmpeg
    // For now, we provide a basic structure
    logger.info(`Video metadata extraction not fully implemented for ${filePath}`)

    return metadata
  }

  /**
   * Get image format from extension
   */
  private getImageFormat(ext: string): string {
    const formats: Record<string, string> = {
      '.png': 'PNG',
      '.jpg': 'JPEG',
      '.jpeg': 'JPEG',
      '.gif': 'GIF',
      '.bmp': 'BMP',
      '.webp': 'WebP',
      '.svg': 'SVG',
    }
    return formats[ext] || ext.substring(1).toUpperCase()
  }

  /**
   * Get audio format from extension
   */
  private getAudioFormat(ext: string): string {
    const formats: Record<string, string> = {
      '.mp3': 'MP3',
      '.wav': 'WAV',
      '.ogg': 'OGG',
      '.m4a': 'M4A',
      '.flac': 'FLAC',
      '.aac': 'AAC',
    }
    return formats[ext] || ext.substring(1).toUpperCase()
  }

  /**
   * Get video format from extension
   */
  private getVideoFormat(ext: string): string {
    const formats: Record<string, string> = {
      '.mp4': 'MP4',
      '.webm': 'WEBM',
      '.avi': 'AVI',
      '.mov': 'MOV',
      '.mkv': 'MKV',
      '.wmv': 'WMV',
      '.flv': 'FLV',
    }
    return formats[ext] || ext.substring(1).toUpperCase()
  }

  /**
   * Parse PNG file for basic metadata
   */
  private parsePNG(buffer: Buffer): { width: number, height: number, hasAlpha: boolean, colorDepth: number } {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      return { width: 0, height: 0, hasAlpha: false, colorDepth: 8 }
    }

    // IHDR chunk starts at byte 8
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    const bitDepth = buffer.readUInt8(24)
    const colorType = buffer.readUInt8(25)

    // Color type 4 (grayscale + alpha) or 6 (RGB + alpha) indicates alpha channel
    const hasAlpha = colorType === 4 || colorType === 6

    return { width, height, hasAlpha, colorDepth: bitDepth }
  }

  /**
   * Parse JPEG file for basic metadata
   */
  private parseJPEG(buffer: Buffer): { width: number, height: number } {
    // JPEG signature: FF D8
    if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
      return { width: 0, height: 0 }
    }

    let offset = 2
    while (offset < buffer.length - 8) {
      // Find SOF (Start of Frame) markers
      if (buffer[offset] === 0xFF && (buffer[offset + 1] >= 0xC0 && buffer[offset + 1] <= 0xC3)) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        return { width, height }
      }

      // Skip to next marker
      if (buffer[offset] === 0xFF) {
        const length = buffer.readUInt16BE(offset + 2)
        offset += length + 2
      }
      else {
        offset++
      }
    }

    return { width: 0, height: 0 }
  }

  /**
   * Parse GIF file for basic metadata
   */
  private parseGIF(buffer: Buffer): { width: number, height: number, animated: boolean } {
    // GIF signature: GIF87a or GIF89a
    if (buffer.length < 10 || !buffer.subarray(0, 3).equals(Buffer.from('GIF'))) {
      return { width: 0, height: 0, animated: false }
    }

    const width = buffer.readUInt16LE(6)
    const height = buffer.readUInt16LE(8)

    // Simple check for animation - look for multiple image descriptors
    let animated = false
    let imageCount = 0
    let offset = 13 // Skip header and global color table info

    while (offset < buffer.length - 1) {
      if (buffer[offset] === 0x21) { // Extension
        offset += 2
        while (offset < buffer.length && buffer[offset] !== 0) {
          offset += buffer[offset] + 1
        }
        offset++
      }
      else if (buffer[offset] === 0x2C) { // Image descriptor
        imageCount++
        if (imageCount > 1) {
          animated = true
          break
        }
        offset += 10 // Skip image descriptor
      }
      else if (buffer[offset] === 0x3B) { // Trailer
        break
      }
      else {
        offset++
      }
    }

    return { width, height, animated }
  }

  /**
   * Parse WebP file for basic metadata
   */
  private parseWebP(buffer: Buffer): { width: number, height: number, animated: boolean, hasAlpha: boolean } {
    // WebP signature: RIFF....WEBP
    if (buffer.length < 20
      || !buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
      || !buffer.subarray(8, 12).equals(Buffer.from('WEBP'))) {
      return { width: 0, height: 0, animated: false, hasAlpha: false }
    }

    const chunk = buffer.subarray(12, 16).toString()
    let width = 0; let height = 0; let animated = false; let hasAlpha = false

    if (chunk === 'VP8 ') {
      // Simple WebP
      width = buffer.readUInt16LE(26) & 0x3FFF
      height = buffer.readUInt16LE(28) & 0x3FFF
    }
    else if (chunk === 'VP8L') {
      // Lossless WebP
      const bits = buffer.readUInt32LE(21)
      width = (bits & 0x3FFF) + 1
      height = ((bits >> 14) & 0x3FFF) + 1
      hasAlpha = !!((bits >> 28) & 1)
    }
    else if (chunk === 'VP8X') {
      // Extended WebP
      // Width and height are stored as 3-byte little-endian values
      width = (buffer.readUInt16LE(24) | (buffer.readUInt8(26) << 16)) + 1
      height = (buffer.readUInt16LE(27) | (buffer.readUInt8(29) << 16)) + 1
      const flags = buffer.readUInt8(20)
      animated = (flags & 0x02) !== 0
      hasAlpha = (flags & 0x10) !== 0
    }

    return { width, height, animated, hasAlpha }
  }

  /**
   * Parse MP3 file for basic metadata (simplified)
   */
  private parseMP3(buffer: Buffer): { duration: number, bitrate?: number, sampleRate?: number } {
    // This is a very basic implementation - would need full MP3 parser for accurate results
    // For now, estimate based on file size and assume average bitrate
    const estimatedBitrate = 128000 // 128 kbps average
    const estimatedDuration = (buffer.length * 8) / estimatedBitrate

    return {
      duration: estimatedDuration,
      bitrate: estimatedBitrate,
      sampleRate: 44100, // Common sample rate
    }
  }

  /**
   * Parse WAV file for basic metadata
   */
  private parseWAV(buffer: Buffer): { duration: number, sampleRate?: number, channels?: number } {
    // WAV signature: RIFF....WAVE
    if (buffer.length < 44
      || !buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
      || !buffer.subarray(8, 12).equals(Buffer.from('WAVE'))) {
      return { duration: 0 }
    }

    const sampleRate = buffer.readUInt32LE(24)
    const channels = buffer.readUInt16LE(22)
    const byteRate = buffer.readUInt32LE(28)
    const dataSize = buffer.readUInt32LE(40)

    const duration = byteRate > 0 ? dataSize / byteRate : 0

    return { duration, sampleRate, channels }
  }
}
