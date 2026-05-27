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
    else if (ext === '.bmp') {
      const bmpData = this.parseBMP(buffer)
      metadata.width = bmpData.width
      metadata.height = bmpData.height
      metadata.hasAlpha = bmpData.hasAlpha
      metadata.colorDepth = bmpData.colorDepth
    }
    else if (ext === '.svg') {
      const svgData = this.parseSVG(buffer)
      metadata.width = svgData.width
      metadata.height = svgData.height
      metadata.hasAlpha = true
    }
    else {
      metadata.width = 0
      metadata.height = 0
    }

    metadata.aspectRatio = metadata.width > 0 && metadata.height > 0
      ? metadata.width / metadata.height
      : 0

    return metadata
  }

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

  private async extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
    const ext = extname(filePath).toLowerCase()
    const buffer = await readFile(filePath)

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

    const parsed = ext === '.mp4' || ext === '.mov' || ext === '.m4v'
      ? this.parseMP4(buffer)
      : ext === '.webm' || ext === '.mkv'
        ? this.parseWebM(buffer)
        : ext === '.avi'
          ? this.parseAVI(buffer)
          : undefined

    if (parsed) {
      metadata.width = parsed.width
      metadata.height = parsed.height
      metadata.aspectRatio = parsed.width > 0 && parsed.height > 0
        ? parsed.width / parsed.height
        : 0
      metadata.duration = parsed.duration
      metadata.frameRate = parsed.frameRate
      metadata.bitrate = parsed.duration > 0 ? Math.round((buffer.length * 8) / parsed.duration) : undefined
      metadata.hasAudio = parsed.hasAudio
      metadata.codec = parsed.codec
    }
    else {
      logger.debug(`Video metadata parser for ${ext || 'unknown'} did not find structured dimensions in ${filePath}`)
    }

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
    let width = 0
    let height = 0
    let animated = false
    let hasAlpha = false

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

  private parseBMP(buffer: Buffer): { width: number, height: number, hasAlpha?: boolean, colorDepth?: number } {
    if (buffer.length < 30 || !buffer.subarray(0, 2).equals(Buffer.from('BM'))) {
      return { width: 0, height: 0 }
    }

    const dibHeaderSize = buffer.readUInt32LE(14)
    if (dibHeaderSize < 12 || buffer.length < 14 + dibHeaderSize) {
      return { width: 0, height: 0 }
    }

    if (dibHeaderSize === 12) {
      const width = buffer.readUInt16LE(18)
      const height = buffer.readUInt16LE(20)
      const colorDepth = buffer.readUInt16LE(24)
      return { width, height, colorDepth, hasAlpha: false }
    }

    const width = Math.abs(buffer.readInt32LE(18))
    const height = Math.abs(buffer.readInt32LE(22))
    const colorDepth = buffer.readUInt16LE(28)
    return { width, height, colorDepth, hasAlpha: colorDepth === 32 }
  }

  private parseSVG(buffer: Buffer): { width: number, height: number } {
    const source = buffer.toString('utf8')
    if (!/<svg[\s>]/i.test(source)) {
      return { width: 0, height: 0 }
    }

    const width = parseSvgLength(getSvgAttribute(source, 'width'))
    const height = parseSvgLength(getSvgAttribute(source, 'height'))
    if (width > 0 && height > 0) {
      return { width, height }
    }

    const viewBox = getSvgAttribute(source, 'viewBox')
    if (!viewBox) {
      return { width: 0, height: 0 }
    }
    const parts = viewBox.trim().split(/[\s,]+/).map(Number)
    if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
      return { width: 0, height: 0 }
    }
    return { width: Math.abs(parts[2]), height: Math.abs(parts[3]) }
  }

  private parseMP3(buffer: Buffer): { duration: number, bitrate?: number, sampleRate?: number } {
    const firstFrameOffset = findMp3FrameOffset(buffer)
    if (firstFrameOffset === -1) {
      return { duration: 0 }
    }

    const firstFrame = parseMp3FrameHeader(buffer, firstFrameOffset)
    if (!firstFrame) {
      return { duration: 0 }
    }

    let offset = firstFrameOffset
    let frames = 0
    while (offset + 4 <= buffer.length) {
      const frame = parseMp3FrameHeader(buffer, offset)
      if (!frame || offset + frame.frameLength > buffer.length) {
        break
      }
      frames += 1
      offset += frame.frameLength
    }

    const duration = frames > 0
      ? (frames * firstFrame.samplesPerFrame) / firstFrame.sampleRate
      : ((buffer.length - firstFrameOffset) * 8) / firstFrame.bitrate

    return {
      duration,
      bitrate: firstFrame.bitrate,
      sampleRate: firstFrame.sampleRate,
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

  private parseMP4(buffer: Buffer): ParsedVideoMetadata | undefined {
    if (!hasMp4Brand(buffer)) {
      return undefined
    }

    const metadata: ParsedVideoMetadata = {
      width: 0,
      height: 0,
      duration: 0,
      hasAudio: false,
      codec: readMp4MajorBrand(buffer),
    }
    walkMp4Boxes(buffer, 0, buffer.length, (box) => {
      switch (box.type) {
        case 'mvhd': {
          const parsed = parseMvhd(buffer, box.dataStart, box.dataEnd)
          if (parsed.duration > 0) {
            metadata.duration = parsed.duration
          }
          break
        }
        case 'tkhd': {
          const parsed = parseTkhd(buffer, box.dataStart, box.dataEnd)
          if (parsed.width > 0 && parsed.height > 0) {
            metadata.width = metadata.width || parsed.width
            metadata.height = metadata.height || parsed.height
          }
          break
        }
        case 'hdlr': {
          const handler = parseHdlr(buffer, box.dataStart, box.dataEnd)
          if (handler === 'soun') {
            metadata.hasAudio = true
          }
          break
        }
        case 'stsd': {
          const codec = parseStsdCodec(buffer, box.dataStart, box.dataEnd)
          if (codec) {
            metadata.codec = codec
          }
          break
        }
      }
    })

    return metadata.width > 0 || metadata.height > 0 || metadata.duration > 0
      ? metadata
      : undefined
  }

  private parseWebM(buffer: Buffer): ParsedVideoMetadata | undefined {
    if (buffer.length < 4 || buffer[0] !== 0x1A || buffer[1] !== 0x45 || buffer[2] !== 0xDF || buffer[3] !== 0xA3) {
      return undefined
    }

    const metadata: ParsedVideoMetadata = {
      width: 0,
      height: 0,
      duration: 0,
      hasAudio: false,
      codec: undefined,
    }
    let timecodeScale = 1000000

    walkEbmlElements(buffer, 0, buffer.length, (element) => {
      switch (element.id) {
        case 0x4282:
          metadata.codec = buffer.subarray(element.dataStart, element.dataEnd).toString('utf8')
          break
        case 0x2AD7B1:
          timecodeScale = readEbmlUnsigned(buffer, element.dataStart, element.dataEnd) || timecodeScale
          break
        case 0x4489:
          metadata.duration = readEbmlFloat(buffer, element.dataStart, element.dataEnd) * timecodeScale / 1_000_000_000
          break
        case 0xB0:
          metadata.width = readEbmlUnsigned(buffer, element.dataStart, element.dataEnd)
          break
        case 0xBA:
          metadata.height = readEbmlUnsigned(buffer, element.dataStart, element.dataEnd)
          break
        case 0x83:
          metadata.hasAudio = metadata.hasAudio || readEbmlUnsigned(buffer, element.dataStart, element.dataEnd) === 2
          break
      }
    })

    return metadata.width > 0 || metadata.height > 0 || metadata.duration > 0
      ? metadata
      : undefined
  }

  private parseAVI(buffer: Buffer): ParsedVideoMetadata | undefined {
    if (buffer.length < 12
      || !buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
      || !buffer.subarray(8, 12).equals(Buffer.from('AVI '))) {
      return undefined
    }

    const avihOffset = buffer.indexOf(Buffer.from('avih'))
    if (avihOffset === -1 || avihOffset + 48 > buffer.length) {
      return undefined
    }

    const dataStart = avihOffset + 8
    const microsecondsPerFrame = buffer.readUInt32LE(dataStart)
    const totalFrames = buffer.readUInt32LE(dataStart + 16)
    const width = buffer.readUInt32LE(dataStart + 32)
    const height = buffer.readUInt32LE(dataStart + 36)
    return {
      width,
      height,
      duration: microsecondsPerFrame > 0 ? (totalFrames * microsecondsPerFrame) / 1_000_000 : 0,
      frameRate: microsecondsPerFrame > 0 ? 1_000_000 / microsecondsPerFrame : undefined,
      hasAudio: buffer.includes(Buffer.from('auds')),
      codec: 'AVI',
    }
  }
}

interface ParsedVideoMetadata {
  width: number
  height: number
  duration: number
  frameRate?: number
  bitrate?: number
  hasAudio?: boolean
  codec?: string
}

interface Mp4Box {
  type: string
  dataStart: number
  dataEnd: number
}

interface EbmlElement {
  id: number
  dataStart: number
  dataEnd: number
}

interface Mp3FrameInfo {
  bitrate: number
  sampleRate: number
  samplesPerFrame: number
  frameLength: number
}

const MP4_CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'])
const MP3_BITRATES: Record<string, number[]> = {
  V1L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  V1L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  V2L2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  V2L3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const MP3_SAMPLE_RATES: Record<number, number[]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
}

function getSvgAttribute(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return match?.[1]
}

function parseSvgLength(value: string | undefined): number {
  if (!value || value.trim().endsWith('%')) {
    return 0
  }
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)/)
  return match ? Number.parseFloat(match[1]) : 0
}

function findMp3FrameOffset(buffer: Buffer): number {
  let offset = 0
  if (buffer.length >= 10 && buffer.subarray(0, 3).equals(Buffer.from('ID3'))) {
    offset = 10 + readSyncSafeInt(buffer, 6)
  }

  for (let index = offset; index < buffer.length - 4; index += 1) {
    if (parseMp3FrameHeader(buffer, index)) {
      return index
    }
  }
  return -1
}

function readSyncSafeInt(buffer: Buffer, offset: number): number {
  return ((buffer[offset] & 0x7F) << 21)
    | ((buffer[offset + 1] & 0x7F) << 14)
    | ((buffer[offset + 2] & 0x7F) << 7)
    | (buffer[offset + 3] & 0x7F)
}

function parseMp3FrameHeader(buffer: Buffer, offset: number): Mp3FrameInfo | undefined {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xFF || (buffer[offset + 1] & 0xE0) !== 0xE0) {
    return undefined
  }

  const versionBits = (buffer[offset + 1] >> 3) & 0x03
  const layerBits = (buffer[offset + 1] >> 1) & 0x03
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0F
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03
  const padding = (buffer[offset + 2] >> 1) & 0x01
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 0x0F || sampleRateIndex === 0x03) {
    return undefined
  }

  const version = versionBits === 3 ? 1 : 2
  const layer = 4 - layerBits
  const bitrateKey = `${version === 1 ? 'V1' : 'V2'}L${layer}` as keyof typeof MP3_BITRATES
  const bitrate = (MP3_BITRATES[bitrateKey]?.[bitrateIndex] || 0) * 1000
  const sampleRate = MP3_SAMPLE_RATES[versionBits]?.[sampleRateIndex] || 0
  if (bitrate <= 0 || sampleRate <= 0) {
    return undefined
  }

  const samplesPerFrame = layer === 1
    ? 384
    : version === 1
      ? 1152
      : layer === 3
        ? 576
        : 1152
  const frameLength = layer === 1
    ? Math.floor(((12 * bitrate) / sampleRate + padding) * 4)
    : Math.floor(((version === 1 ? 144 : 72) * bitrate) / sampleRate + padding)

  return { bitrate, sampleRate, samplesPerFrame, frameLength }
}

function hasMp4Brand(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false
  }
  return buffer.subarray(4, 8).equals(Buffer.from('ftyp'))
}

function readMp4MajorBrand(buffer: Buffer): string | undefined {
  return hasMp4Brand(buffer) && buffer.length >= 12
    ? buffer.subarray(8, 12).toString('ascii').trim()
    : undefined
}

function walkMp4Boxes(buffer: Buffer, start: number, end: number, visitor: (box: Mp4Box) => void): void {
  let offset = start
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    const size32 = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    let headerSize = 8
    let size = size32
    if (size32 === 1) {
      if (offset + 16 > end) {
        return
      }
      size = Number(buffer.readBigUInt64BE(offset + 8))
      headerSize = 16
    }
    else if (size32 === 0) {
      size = end - offset
    }
    if (size < headerSize || offset + size > end) {
      return
    }

    const box = {
      type,
      dataStart: offset + headerSize,
      dataEnd: offset + size,
    }
    visitor(box)
    if (MP4_CONTAINER_BOXES.has(type)) {
      walkMp4Boxes(buffer, box.dataStart, box.dataEnd, visitor)
    }
    offset += size
  }
}

function parseMvhd(buffer: Buffer, start: number, end: number): { duration: number } {
  if (end - start < 20) {
    return { duration: 0 }
  }
  const version = buffer.readUInt8(start)
  if (version === 1) {
    if (end - start < 32) {
      return { duration: 0 }
    }
    const timescale = buffer.readUInt32BE(start + 20)
    const duration = Number(buffer.readBigUInt64BE(start + 24))
    return { duration: timescale > 0 ? duration / timescale : 0 }
  }
  const timescale = buffer.readUInt32BE(start + 12)
  const duration = buffer.readUInt32BE(start + 16)
  return { duration: timescale > 0 ? duration / timescale : 0 }
}

function parseTkhd(buffer: Buffer, start: number, end: number): { width: number, height: number } {
  if (end - start < 84) {
    return { width: 0, height: 0 }
  }
  const version = buffer.readUInt8(start)
  const dimensionOffset = version === 1 ? 88 : 76
  if (start + dimensionOffset + 8 > end) {
    return { width: 0, height: 0 }
  }
  return {
    width: buffer.readUInt32BE(start + dimensionOffset) / 65536,
    height: buffer.readUInt32BE(start + dimensionOffset + 4) / 65536,
  }
}

function parseHdlr(buffer: Buffer, start: number, end: number): string | undefined {
  if (start + 12 > end) {
    return undefined
  }
  return buffer.subarray(start + 8, start + 12).toString('ascii')
}

function parseStsdCodec(buffer: Buffer, start: number, end: number): string | undefined {
  if (start + 16 > end) {
    return undefined
  }
  const sampleEntryOffset = start + 16
  return sampleEntryOffset + 4 <= end
    ? buffer.subarray(sampleEntryOffset, sampleEntryOffset + 4).toString('ascii').trim()
    : undefined
}

function walkEbmlElements(buffer: Buffer, start: number, end: number, visitor: (element: EbmlElement) => void): void {
  let offset = start
  while (offset < end) {
    const id = readEbmlId(buffer, offset)
    if (!id) {
      return
    }
    const size = readEbmlSize(buffer, offset + id.length)
    if (!size) {
      return
    }
    const dataStart = offset + id.length + size.length
    const dataEnd = dataStart + size.value
    if (dataEnd > end || dataEnd > buffer.length) {
      return
    }

    const element = { id: id.value, dataStart, dataEnd }
    visitor(element)
    if (isEbmlContainer(id.value)) {
      walkEbmlElements(buffer, dataStart, dataEnd, visitor)
    }
    offset = dataEnd
  }
}

function readEbmlId(buffer: Buffer, offset: number): { value: number, length: number } | undefined {
  const first = buffer[offset]
  if (first === undefined) {
    return undefined
  }
  let length = 1
  let marker = 0x80
  while (length <= 4 && (first & marker) === 0) {
    marker >>= 1
    length += 1
  }
  if (length > 4 || offset + length > buffer.length) {
    return undefined
  }
  let value = 0
  for (let index = 0; index < length; index += 1) {
    value = (value << 8) | buffer[offset + index]
  }
  return { value, length }
}

function readEbmlSize(buffer: Buffer, offset: number): { value: number, length: number } | undefined {
  const first = buffer[offset]
  if (first === undefined) {
    return undefined
  }
  let length = 1
  let marker = 0x80
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1
    length += 1
  }
  if (length > 8 || offset + length > buffer.length) {
    return undefined
  }
  let value = first & (marker - 1)
  for (let index = 1; index < length; index += 1) {
    value = (value * 256) + buffer[offset + index]
  }
  return { value, length }
}

function isEbmlContainer(id: number): boolean {
  return id === 0x1A45DFA3
    || id === 0x18538067
    || id === 0x1549A966
    || id === 0x1654AE6B
    || id === 0xAE
    || id === 0xE0
}

function readEbmlUnsigned(buffer: Buffer, start: number, end: number): number {
  let value = 0
  for (let offset = start; offset < end; offset += 1) {
    value = value * 256 + buffer[offset]
  }
  return value
}

function readEbmlFloat(buffer: Buffer, start: number, end: number): number {
  const length = end - start
  if (length === 4) {
    return buffer.readFloatBE(start)
  }
  if (length === 8) {
    return buffer.readDoubleBE(start)
  }
  return 0
}
