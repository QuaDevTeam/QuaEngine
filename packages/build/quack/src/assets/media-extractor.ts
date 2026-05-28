import type { InputTrack, InputVideoTrack } from 'mediabunny'
import type { AudioMetadata, ImageMetadata, MediaMetadata, VideoMetadata } from '../core/types'
import { open, readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { createLogger } from '@quajs/logger'
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny'

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
    return ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.m4v', '.wmv', '.flv'].includes(ext)
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
    const ext = extname(filePath).toLowerCase()
    const metadata = this.createAudioMetadata(ext)

    if (!await isMediabunnyAudioCandidate(filePath, ext)) {
      return metadata
    }

    try {
      return await this.extractMediabunnyAudioMetadata(filePath, metadata)
    }
    catch (error) {
      logger.debug(`Audio metadata parser for ${ext || 'unknown'} did not find structured metadata in ${filePath}`, error)
      return metadata
    }
  }

  private async extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
    const ext = extname(filePath).toLowerCase()
    const metadata = this.createVideoMetadata(ext)

    if (isLegacyVideoExtension(ext)) {
      return await this.extractLegacyVideoMetadata(filePath, metadata)
    }

    if (!await isMediabunnyVideoCandidate(filePath, ext)) {
      return metadata
    }

    try {
      return await this.extractMediabunnyVideoMetadata(filePath, metadata)
    }
    catch (error) {
      logger.debug(`Video metadata parser for ${ext || 'unknown'} did not find structured metadata in ${filePath}`, error)
      return metadata
    }
  }

  private async extractLegacyVideoMetadata(filePath: string, metadata: VideoMetadata): Promise<VideoMetadata> {
    try {
      const parsed = await extractLegacyVideoMetadata(filePath, metadata.format)
      applyParsedVideoMetadata(metadata, parsed, await getFileSize(filePath))
    }
    catch (error) {
      logger.debug(`Legacy video metadata parser for ${metadata.format} did not find structured metadata in ${filePath}`, error)
    }
    return metadata
  }

  private createAudioMetadata(ext: string): AudioMetadata {
    return {
      duration: 0,
      format: this.getAudioFormat(ext),
      bitrate: undefined,
      sampleRate: undefined,
      channels: undefined,
    }
  }

  private createVideoMetadata(ext: string): VideoMetadata {
    return {
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
  }

  private async extractMediabunnyAudioMetadata(filePath: string, metadata: AudioMetadata): Promise<AudioMetadata> {
    const input = new Input({
      source: new FilePathSource(filePath),
      formats: ALL_FORMATS,
    })

    try {
      if (!await tryValue(() => input.canRead())) {
        return metadata
      }

      const audioTrack = await tryValue(() => input.getPrimaryAudioTrack())
      if (!audioTrack) {
        return metadata
      }

      const duration = await getInputDuration(input) || await getTrackDuration(audioTrack)
      const averageBitrate = await tryNumber(() => audioTrack.getAverageBitrate())

      metadata.duration = duration
      metadata.sampleRate = await tryNumber(() => audioTrack.getSampleRate())
      metadata.channels = await tryNumber(() => audioTrack.getNumberOfChannels())
      metadata.bitrate = averageBitrate ?? estimateBitrate(await getFileSize(filePath), duration)
      return metadata
    }
    finally {
      input.dispose()
    }
  }

  private async extractMediabunnyVideoMetadata(filePath: string, metadata: VideoMetadata): Promise<VideoMetadata> {
    const input = new Input({
      source: new FilePathSource(filePath),
      formats: ALL_FORMATS,
    })

    try {
      if (!await tryValue(() => input.canRead())) {
        return metadata
      }

      const videoTrack = await tryValue(() => input.getPrimaryVideoTrack())
      const audioTrack = await tryValue(() => input.getPrimaryAudioTrack())
      metadata.hasAudio = !!audioTrack
      if (!videoTrack) {
        return metadata
      }

      const duration = await getInputDuration(input) || await getTrackDuration(videoTrack)
      const width = await tryNumber(() => videoTrack.getDisplayWidth()) ?? 0
      const height = await tryNumber(() => videoTrack.getDisplayHeight()) ?? 0

      metadata.width = width
      metadata.height = height
      metadata.aspectRatio = width > 0 && height > 0 ? width / height : 0
      metadata.duration = duration
      metadata.frameRate = await getAveragePacketRate(videoTrack)
      metadata.bitrate = estimateBitrate(await getFileSize(filePath), duration)
      metadata.codec = await getTrackCodecString(videoTrack)
      return metadata
    }
    finally {
      input.dispose()
    }
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
      '.m4v': 'M4V',
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

async function getInputDuration(input: Input, tracks?: InputTrack[]): Promise<number> {
  const computedDuration = await tryNumber(() => input.computeDuration(tracks, { skipLiveWait: true }), { allowZero: true })
  if (computedDuration !== undefined) {
    return computedDuration
  }

  const metadataDuration = await tryNumber(() => input.getDurationFromMetadata(tracks, { skipLiveWait: true }), { allowZero: true })
  return metadataDuration ?? 0
}

async function getTrackDuration(track: InputTrack): Promise<number> {
  const computedDuration = await tryNumber(() => track.computeDuration({ skipLiveWait: true }), { allowZero: true })
  if (computedDuration !== undefined) {
    return computedDuration
  }

  const metadataDuration = await tryNumber(() => track.getDurationFromMetadata({ skipLiveWait: true }), { allowZero: true })
  return metadataDuration ?? 0
}

async function getAveragePacketRate(track: InputVideoTrack): Promise<number | undefined> {
  const packetStats = await tryValue(() => track.computePacketStats(100, { skipLiveWait: true }))
  return normalizePositiveNumber(packetStats?.averagePacketRate)
}

interface ParsedVideoMetadata {
  width?: number
  height?: number
  duration?: number
  frameRate?: number
  bitrate?: number
  hasAudio?: boolean
  codec?: string
}

async function extractLegacyVideoMetadata(filePath: string, format: string): Promise<ParsedVideoMetadata> {
  switch (format) {
    case 'AVI':
      return parseAviMetadata(await readMediaWindow(filePath, 0, 16 * 1024 * 1024))
    case 'FLV':
      return await parseFlvMetadata(filePath, await readMediaWindow(filePath, 0, 4 * 1024 * 1024))
    case 'WMV':
      return parseAsfMetadata(await readMediaWindow(filePath, 0, 8 * 1024 * 1024))
    default:
      return {}
  }
}

function applyParsedVideoMetadata(metadata: VideoMetadata, parsed: ParsedVideoMetadata, fileSize: number | undefined): void {
  metadata.width = parsed.width ?? metadata.width
  metadata.height = parsed.height ?? metadata.height
  metadata.aspectRatio = metadata.width > 0 && metadata.height > 0 ? metadata.width / metadata.height : metadata.aspectRatio
  metadata.duration = parsed.duration ?? metadata.duration
  metadata.frameRate = parsed.frameRate ?? metadata.frameRate
  metadata.bitrate = parsed.bitrate ?? estimateBitrate(fileSize, metadata.duration)
  metadata.hasAudio = parsed.hasAudio ?? metadata.hasAudio
  metadata.codec = parsed.codec ?? metadata.codec
}

function isLegacyVideoExtension(ext: string): boolean {
  return ext === '.avi' || ext === '.wmv' || ext === '.flv'
}

async function isMediabunnyAudioCandidate(filePath: string, ext: string): Promise<boolean> {
  const header = await readMediaHeader(filePath)
  switch (ext) {
    case '.mp3':
      return await hasLikelyMp3AudioFile(filePath, header.bytes)
    case '.wav':
      return hasAscii(header.bytes, 0, 'RIFF') && hasAscii(header.bytes, 8, 'WAVE')
    case '.ogg':
      return hasAscii(header.bytes, 0, 'OggS')
    case '.m4a':
      return hasIsoBmffFtyp(header.bytes)
    case '.flac':
      return hasAscii(header.bytes, 0, 'fLaC')
    case '.aac':
      return hasAdtsSync(header.bytes)
    default:
      return false
  }
}

async function isMediabunnyVideoCandidate(filePath: string, ext: string): Promise<boolean> {
  const header = await readMediaHeader(filePath)
  switch (ext) {
    case '.mp4':
    case '.mov':
    case '.m4v':
      return hasIsoBmffFtyp(header.bytes)
    case '.webm':
    case '.mkv':
      return header.bytes.length >= 4
        && header.bytes[0] === 0x1A
        && header.bytes[1] === 0x45
        && header.bytes[2] === 0xDF
        && header.bytes[3] === 0xA3
    default:
      return false
  }
}

async function readMediaHeader(filePath: string): Promise<{ bytes: Buffer, size: number }> {
  const buffer = Buffer.alloc(4096)
  try {
    const file = await open(filePath, 'r')
    try {
      const [readResult, stats] = await Promise.all([
        file.read(buffer, 0, buffer.length, 0),
        file.stat(),
      ])
      return { bytes: buffer.subarray(0, readResult.bytesRead), size: stats.size }
    }
    finally {
      await file.close()
    }
  }
  catch {
    return { bytes: Buffer.alloc(0), size: 0 }
  }
}

async function readMediaWindow(filePath: string, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  try {
    const file = await open(filePath, 'r')
    try {
      const readResult = await file.read(buffer, 0, buffer.length, offset)
      return buffer.subarray(0, readResult.bytesRead)
    }
    finally {
      await file.close()
    }
  }
  catch {
    return Buffer.alloc(0)
  }
}

function parseAviMetadata(buffer: Buffer): ParsedVideoMetadata {
  if (buffer.length < 12 || !hasAscii(buffer, 0, 'RIFF') || !hasAscii(buffer, 8, 'AVI ')) {
    return {}
  }

  const parsed: ParsedVideoMetadata = {}
  parseAviChunkRange(buffer, 12, buffer.length, parsed)
  return parsed
}

interface AviStreamState {
  type?: string
  codec?: string
  frameRate?: number
  width?: number
  height?: number
}

function parseAviChunkRange(buffer: Buffer, start: number, end: number, parsed: ParsedVideoMetadata, stream?: AviStreamState): void {
  let offset = start
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii')
    const size = buffer.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    const dataEnd = Math.min(dataStart + size, end, buffer.length)

    if (dataEnd < dataStart) {
      break
    }

    if (id === 'LIST' && dataStart + 4 <= dataEnd) {
      const listType = buffer.subarray(dataStart, dataStart + 4).toString('ascii')
      if (listType === 'strl') {
        const childStream: AviStreamState = {}
        parseAviChunkRange(buffer, dataStart + 4, dataEnd, parsed, childStream)
        applyAviStreamMetadata(parsed, childStream)
      }
      else if (listType === 'hdrl') {
        parseAviChunkRange(buffer, dataStart + 4, dataEnd, parsed, stream)
      }
    }
    else if (id === 'avih') {
      parseAviMainHeader(buffer.subarray(dataStart, dataEnd), parsed)
    }
    else if (id === 'strh' && stream) {
      parseAviStreamHeader(buffer.subarray(dataStart, dataEnd), stream)
    }
    else if (id === 'strf' && stream) {
      parseAviStreamFormat(buffer.subarray(dataStart, dataEnd), stream)
    }

    offset = dataStart + size + (size % 2)
  }
}

function parseAviMainHeader(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 40) {
    return
  }

  const microsecondsPerFrame = buffer.readUInt32LE(0)
  const totalFrames = buffer.readUInt32LE(16)
  const width = buffer.readUInt32LE(32)
  const height = buffer.readUInt32LE(36)

  parsed.width = normalizePositiveNumber(width) ?? parsed.width
  parsed.height = normalizePositiveNumber(height) ?? parsed.height
  if (microsecondsPerFrame > 0) {
    parsed.frameRate = normalizePositiveNumber(1_000_000 / microsecondsPerFrame) ?? parsed.frameRate
    if (totalFrames > 0) {
      parsed.duration = normalizePositiveNumber((totalFrames * microsecondsPerFrame) / 1_000_000) ?? parsed.duration
    }
  }
}

function parseAviStreamHeader(buffer: Buffer, stream: AviStreamState): void {
  if (buffer.length < 56) {
    return
  }

  stream.type = buffer.subarray(0, 4).toString('ascii')
  const codec = buffer.subarray(4, 8).toString('ascii').replace(/\0+$/g, '').trim()
  if (codec) {
    stream.codec = codec
  }

  const scale = buffer.readUInt32LE(20)
  const rate = buffer.readUInt32LE(24)
  if (scale > 0 && rate > 0) {
    stream.frameRate = normalizePositiveNumber(rate / scale) ?? stream.frameRate
  }

  const left = buffer.readInt16LE(48)
  const top = buffer.readInt16LE(50)
  const right = buffer.readInt16LE(52)
  const bottom = buffer.readInt16LE(54)
  stream.width = normalizePositiveNumber(Math.abs(right - left)) ?? stream.width
  stream.height = normalizePositiveNumber(Math.abs(bottom - top)) ?? stream.height
}

function parseAviStreamFormat(buffer: Buffer, stream: AviStreamState): void {
  if (stream.type === 'vids' && buffer.length >= 40) {
    stream.width = normalizePositiveNumber(Math.abs(buffer.readInt32LE(4))) ?? stream.width
    stream.height = normalizePositiveNumber(Math.abs(buffer.readInt32LE(8))) ?? stream.height
    const codec = buffer.subarray(16, 20).toString('ascii').replace(/\0+$/g, '').trim()
    if (codec) {
      stream.codec = codec
    }
  }
}

function applyAviStreamMetadata(parsed: ParsedVideoMetadata, stream: AviStreamState): void {
  if (stream.type === 'vids') {
    parsed.width = stream.width ?? parsed.width
    parsed.height = stream.height ?? parsed.height
    parsed.frameRate = stream.frameRate ?? parsed.frameRate
    parsed.codec = stream.codec ?? parsed.codec
  }
  else if (stream.type === 'auds') {
    parsed.hasAudio = true
  }
}

async function parseFlvMetadata(filePath: string, buffer: Buffer): Promise<ParsedVideoMetadata> {
  if (buffer.length < 13 || !hasAscii(buffer, 0, 'FLV')) {
    return {}
  }

  const parsed: ParsedVideoMetadata = {
    hasAudio: (buffer[4] & 0x04) !== 0,
  }
  const dataOffset = buffer.readUInt32BE(5)
  parseFlvTags(buffer, dataOffset + 4, parsed)

  if (!parsed.duration) {
    parsed.duration = await getLastFlvTimestamp(filePath)
  }

  return parsed
}

function parseFlvTags(buffer: Buffer, start: number, parsed: ParsedVideoMetadata): void {
  let offset = start
  while (offset + 11 <= buffer.length) {
    const tagType = buffer[offset]
    const dataSize = readUInt24BE(buffer, offset + 1)
    const timestamp = readFlvTimestamp(buffer, offset + 4)
    const dataStart = offset + 11
    const dataEnd = dataStart + dataSize
    if (dataEnd > buffer.length) {
      break
    }

    if (tagType === 8) {
      parsed.hasAudio = true
    }
    else if (tagType === 9) {
      parseFlvVideoTag(buffer.subarray(dataStart, dataEnd), parsed)
    }
    else if (tagType === 18) {
      parseFlvScriptTag(buffer.subarray(dataStart, dataEnd), parsed)
    }

    if (timestamp > 0) {
      parsed.duration = Math.max(parsed.duration ?? 0, timestamp / 1000)
    }

    offset = dataEnd + 4
  }
}

function parseFlvVideoTag(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 1) {
    return
  }

  const codecId = buffer[0] & 0x0F
  parsed.codec = parsed.codec ?? getFlvVideoCodec(codecId)
  if (codecId === 7 && buffer.length >= 11 && buffer[1] === 0) {
    const avcConfig = parseAvcDecoderConfigurationRecord(buffer.subarray(5))
    parsed.width = avcConfig.width ?? parsed.width
    parsed.height = avcConfig.height ?? parsed.height
    parsed.codec = avcConfig.codec ?? parsed.codec
  }
}

function parseFlvScriptTag(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  const firstValue = readAmfValue(buffer, 0)
  if (!firstValue || firstValue.value !== 'onMetaData') {
    return
  }

  const secondValue = readAmfValue(buffer, firstValue.offset)
  if (!secondValue || typeof secondValue.value !== 'object' || secondValue.value === null || Array.isArray(secondValue.value)) {
    return
  }

  const metadata = secondValue.value as Record<string, unknown>
  parsed.duration = normalizePositiveNumber(readMetadataNumber(metadata.duration)) ?? parsed.duration
  parsed.width = normalizePositiveNumber(readMetadataNumber(metadata.width)) ?? parsed.width
  parsed.height = normalizePositiveNumber(readMetadataNumber(metadata.height)) ?? parsed.height
  parsed.frameRate = normalizePositiveNumber(readMetadataNumber(metadata.framerate) ?? readMetadataNumber(metadata.frameRate)) ?? parsed.frameRate
  parsed.bitrate = normalizePositiveNumber(readMetadataNumber(metadata.videodatarate) ? readMetadataNumber(metadata.videodatarate)! * 1000 : undefined) ?? parsed.bitrate
  parsed.hasAudio = readMetadataNumber(metadata.audiocodecid) !== undefined || parsed.hasAudio
  const codec = getFlvMetadataCodec(metadata.videocodecid)
  if (codec) {
    parsed.codec = codec
  }
}

async function getLastFlvTimestamp(filePath: string): Promise<number | undefined> {
  const fileSize = await getFileSize(filePath)
  if (!fileSize || fileSize < 24) {
    return undefined
  }

  const previousTagSizeBytes = await readMediaWindow(filePath, fileSize - 4, 4)
  if (previousTagSizeBytes.length < 4) {
    return undefined
  }

  const previousTagSize = previousTagSizeBytes.readUInt32BE(0)
  const lastTagOffset = fileSize - 4 - previousTagSize
  if (previousTagSize < 11 || lastTagOffset < 13) {
    return undefined
  }

  const tagHeader = await readMediaWindow(filePath, lastTagOffset, 11)
  if (tagHeader.length < 11) {
    return undefined
  }

  return normalizePositiveNumber(readFlvTimestamp(tagHeader, 4) / 1000)
}

const ASF_HEADER_OBJECT = Buffer.from([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C])
const ASF_FILE_PROPERTIES_OBJECT = Buffer.from([0xA1, 0xDC, 0xAB, 0x8C, 0x47, 0xA9, 0xCF, 0x11, 0x8E, 0xE4, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])
const ASF_STREAM_PROPERTIES_OBJECT = Buffer.from([0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11, 0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])
const ASF_CODEC_LIST_OBJECT = Buffer.from([0x40, 0x52, 0xD1, 0x86, 0x1D, 0x31, 0xD0, 0x11, 0xA3, 0xA4, 0x00, 0xA0, 0xC9, 0x03, 0x48, 0xF6])
const ASF_AUDIO_MEDIA = Buffer.from([0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])
const ASF_VIDEO_MEDIA = Buffer.from([0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])

function parseAsfMetadata(buffer: Buffer): ParsedVideoMetadata {
  if (buffer.length < 30 || !hasGuid(buffer, 0, ASF_HEADER_OBJECT)) {
    return {}
  }

  const headerSize = readUInt64LE(buffer, 16)
  if (!headerSize || headerSize < 30) {
    return {}
  }

  const parsed: ParsedVideoMetadata = {}
  let offset = 30
  const end = Math.min(buffer.length, headerSize)
  while (offset + 24 <= end) {
    const objectSize = readUInt64LE(buffer, offset + 16)
    if (!objectSize || objectSize < 24 || offset + objectSize > buffer.length) {
      break
    }

    const dataStart = offset + 24
    const dataEnd = offset + objectSize
    if (hasGuid(buffer, offset, ASF_FILE_PROPERTIES_OBJECT)) {
      parseAsfFileProperties(buffer.subarray(dataStart, dataEnd), parsed)
    }
    else if (hasGuid(buffer, offset, ASF_STREAM_PROPERTIES_OBJECT)) {
      parseAsfStreamProperties(buffer.subarray(dataStart, dataEnd), parsed)
    }
    else if (hasGuid(buffer, offset, ASF_CODEC_LIST_OBJECT)) {
      parseAsfCodecList(buffer.subarray(dataStart, dataEnd), parsed)
    }

    offset += objectSize
  }

  return parsed
}

function parseAsfFileProperties(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 84) {
    return
  }

  const playDuration = readUInt64LE(buffer, 40)
  const preroll = readUInt64LE(buffer, 56) ?? 0
  const maxBitrate = buffer.readUInt32LE(80)
  if (playDuration && playDuration > preroll * 10_000) {
    parsed.duration = normalizePositiveNumber((playDuration / 10_000_000) - (preroll / 1000)) ?? parsed.duration
  }
  parsed.bitrate = normalizePositiveNumber(maxBitrate) ?? parsed.bitrate
}

function parseAsfStreamProperties(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 54) {
    return
  }

  const typeSpecificDataLength = buffer.readUInt32LE(40)
  const typeSpecificData = buffer.subarray(54, Math.min(54 + typeSpecificDataLength, buffer.length))
  if (hasGuid(buffer, 0, ASF_AUDIO_MEDIA)) {
    parsed.hasAudio = true
  }
  else if (hasGuid(buffer, 0, ASF_VIDEO_MEDIA)) {
    parseAsfVideoInfoHeader(typeSpecificData, parsed)
  }
}

function parseAsfVideoInfoHeader(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 80) {
    return
  }

  const bitrate = buffer.readUInt32LE(32)
  const averageTimePerFrame = readUInt64LE(buffer, 40)
  const bitmapInfoHeader = buffer.subarray(48)
  parsed.bitrate = normalizePositiveNumber(bitrate) ?? parsed.bitrate
  if (averageTimePerFrame && averageTimePerFrame > 0) {
    parsed.frameRate = normalizePositiveNumber(10_000_000 / averageTimePerFrame) ?? parsed.frameRate
  }
  if (bitmapInfoHeader.length >= 40) {
    parsed.width = normalizePositiveNumber(Math.abs(bitmapInfoHeader.readInt32LE(4))) ?? parsed.width
    parsed.height = normalizePositiveNumber(Math.abs(bitmapInfoHeader.readInt32LE(8))) ?? parsed.height
    parsed.codec = readFourCc(bitmapInfoHeader, 16) ?? parsed.codec
  }
}

function parseAsfCodecList(buffer: Buffer, parsed: ParsedVideoMetadata): void {
  if (buffer.length < 20) {
    return
  }

  let offset = 20
  while (offset + 2 <= buffer.length) {
    const codecType = buffer.readUInt16LE(offset)
    offset += 2
    const nameLength = readAsfUtf16Length(buffer, offset)
    offset += 2
    const name = readUtf16LeString(buffer, offset, nameLength)
    offset += nameLength * 2
    if (offset + 2 > buffer.length) {
      break
    }
    const descriptionLength = readAsfUtf16Length(buffer, offset)
    offset += 2 + descriptionLength * 2
    if (offset + 2 > buffer.length) {
      break
    }
    const informationLength = buffer.readUInt16LE(offset)
    offset += 2 + informationLength

    if (codecType === 1 && name) {
      parsed.codec = parsed.codec ?? name
    }
  }
}

function hasAscii(buffer: Buffer, offset: number, value: string): boolean {
  return buffer.length >= offset + value.length && buffer.subarray(offset, offset + value.length).equals(Buffer.from(value))
}

function readFourCc(buffer: Buffer, offset: number): string | undefined {
  if (offset + 4 > buffer.length) {
    return undefined
  }
  const value = buffer.subarray(offset, offset + 4).toString('ascii').replace(/\0+$/g, '').trim()
  return value || undefined
}

function readUInt24BE(buffer: Buffer, offset: number): number {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2]
}

function readFlvTimestamp(buffer: Buffer, offset: number): number {
  return buffer[offset + 3] * 0x1000000 + buffer[offset] * 0x10000 + buffer[offset + 1] * 0x100 + buffer[offset + 2]
}

function getFlvVideoCodec(codecId: number): string | undefined {
  const codecs: Record<number, string> = {
    2: 'Sorenson H.263',
    3: 'Screen Video',
    4: 'On2 VP6',
    5: 'On2 VP6 Alpha',
    6: 'Screen Video 2',
    7: 'AVC',
    12: 'HEVC',
  }
  return codecs[codecId]
}

function getFlvMetadataCodec(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined
  }
  const numericValue = readMetadataNumber(value)
  return numericValue !== undefined ? getFlvVideoCodec(numericValue) : undefined
}

function readMetadataNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

interface AmfReadResult {
  value: unknown
  offset: number
}

function readAmfValue(buffer: Buffer, offset: number): AmfReadResult | undefined {
  if (offset >= buffer.length) {
    return undefined
  }

  const type = buffer[offset]
  offset += 1
  switch (type) {
    case 0:
      if (offset + 8 > buffer.length) {
        return undefined
      }
      return { value: buffer.readDoubleBE(offset), offset: offset + 8 }
    case 1:
      if (offset + 1 > buffer.length) {
        return undefined
      }
      return { value: buffer[offset] !== 0, offset: offset + 1 }
    case 2:
      return readAmfString(buffer, offset)
    case 3:
      return readAmfObject(buffer, offset)
    case 8:
      if (offset + 4 > buffer.length) {
        return undefined
      }
      return readAmfObject(buffer, offset + 4)
    case 10:
      return readAmfStrictArray(buffer, offset)
    case 11:
      if (offset + 10 > buffer.length) {
        return undefined
      }
      return { value: new Date(buffer.readDoubleBE(offset)), offset: offset + 10 }
    case 12:
      return readAmfLongString(buffer, offset)
    default:
      return undefined
  }
}

function readAmfString(buffer: Buffer, offset: number): AmfReadResult | undefined {
  if (offset + 2 > buffer.length) {
    return undefined
  }
  const length = buffer.readUInt16BE(offset)
  const dataStart = offset + 2
  if (dataStart + length > buffer.length) {
    return undefined
  }
  return { value: buffer.subarray(dataStart, dataStart + length).toString('utf8'), offset: dataStart + length }
}

function readAmfLongString(buffer: Buffer, offset: number): AmfReadResult | undefined {
  if (offset + 4 > buffer.length) {
    return undefined
  }
  const length = buffer.readUInt32BE(offset)
  const dataStart = offset + 4
  if (dataStart + length > buffer.length) {
    return undefined
  }
  return { value: buffer.subarray(dataStart, dataStart + length).toString('utf8'), offset: dataStart + length }
}

function readAmfObject(buffer: Buffer, offset: number): AmfReadResult | undefined {
  const value: Record<string, unknown> = {}
  while (offset + 3 <= buffer.length) {
    if (buffer[offset] === 0 && buffer[offset + 1] === 0 && buffer[offset + 2] === 9) {
      return { value, offset: offset + 3 }
    }

    const keyLength = buffer.readUInt16BE(offset)
    offset += 2
    if (offset + keyLength > buffer.length) {
      return undefined
    }

    const key = buffer.subarray(offset, offset + keyLength).toString('utf8')
    offset += keyLength
    const property = readAmfValue(buffer, offset)
    if (!property) {
      return undefined
    }
    value[key] = property.value
    offset = property.offset
  }

  return { value, offset }
}

function readAmfStrictArray(buffer: Buffer, offset: number): AmfReadResult | undefined {
  if (offset + 4 > buffer.length) {
    return undefined
  }

  const length = buffer.readUInt32BE(offset)
  offset += 4
  const value: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const item = readAmfValue(buffer, offset)
    if (!item) {
      return undefined
    }
    value.push(item.value)
    offset = item.offset
  }
  return { value, offset }
}

function parseAvcDecoderConfigurationRecord(buffer: Buffer): ParsedVideoMetadata {
  if (buffer.length < 8) {
    return {}
  }

  const codec = `avc1.${buffer.subarray(1, 4).toString('hex')}`
  const sequenceParameterSetCount = buffer[5] & 0x1F
  let offset = 6
  for (let index = 0; index < sequenceParameterSetCount; index += 1) {
    if (offset + 2 > buffer.length) {
      return { codec }
    }
    const length = buffer.readUInt16BE(offset)
    offset += 2
    if (offset + length > buffer.length) {
      return { codec }
    }
    const dimensions = parseH264SpsDimensions(buffer.subarray(offset, offset + length))
    if (dimensions.width && dimensions.height) {
      return { ...dimensions, codec }
    }
    offset += length
  }

  return { codec }
}

function parseH264SpsDimensions(sps: Buffer): { width?: number, height?: number } {
  try {
    const rbsp = removeH264EmulationPreventionBytes(sps.subarray(1))
    const bits = new BitReader(rbsp)
    const profileIdc = bits.readBits(8)
    bits.readBits(8)
    bits.readBits(8)
    bits.readUnsignedExpGolomb()

    let chromaFormatIdc = 1
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profileIdc)) {
      chromaFormatIdc = bits.readUnsignedExpGolomb()
      if (chromaFormatIdc === 3) {
        bits.readBits(1)
      }
      bits.readUnsignedExpGolomb()
      bits.readUnsignedExpGolomb()
      bits.readBits(1)
      if (bits.readBits(1) === 1) {
        const scalingListCount = chromaFormatIdc !== 3 ? 8 : 12
        for (let index = 0; index < scalingListCount; index += 1) {
          if (bits.readBits(1) === 1) {
            skipH264ScalingList(bits, index < 6 ? 16 : 64)
          }
        }
      }
    }

    bits.readUnsignedExpGolomb()
    const pictureOrderCountType = bits.readUnsignedExpGolomb()
    if (pictureOrderCountType === 0) {
      bits.readUnsignedExpGolomb()
    }
    else if (pictureOrderCountType === 1) {
      bits.readBits(1)
      bits.readSignedExpGolomb()
      bits.readSignedExpGolomb()
      const cycleCount = bits.readUnsignedExpGolomb()
      for (let index = 0; index < cycleCount; index += 1) {
        bits.readSignedExpGolomb()
      }
    }

    bits.readUnsignedExpGolomb()
    bits.readBits(1)
    const picWidthInMbsMinus1 = bits.readUnsignedExpGolomb()
    const picHeightInMapUnitsMinus1 = bits.readUnsignedExpGolomb()
    const frameMbsOnlyFlag = bits.readBits(1)
    if (frameMbsOnlyFlag === 0) {
      bits.readBits(1)
    }
    bits.readBits(1)

    let cropLeft = 0
    let cropRight = 0
    let cropTop = 0
    let cropBottom = 0
    if (bits.readBits(1) === 1) {
      cropLeft = bits.readUnsignedExpGolomb()
      cropRight = bits.readUnsignedExpGolomb()
      cropTop = bits.readUnsignedExpGolomb()
      cropBottom = bits.readUnsignedExpGolomb()
    }

    const cropUnits = getH264CropUnits(chromaFormatIdc, frameMbsOnlyFlag)
    const width = ((picWidthInMbsMinus1 + 1) * 16) - (cropLeft + cropRight) * cropUnits.x
    const height = ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - (cropTop + cropBottom) * cropUnits.y
    return {
      width: normalizePositiveNumber(width),
      height: normalizePositiveNumber(height),
    }
  }
  catch {
    return {}
  }
}

function removeH264EmulationPreventionBytes(buffer: Buffer): Buffer {
  const bytes: number[] = []
  for (let index = 0; index < buffer.length; index += 1) {
    if (index + 2 < buffer.length && buffer[index] === 0 && buffer[index + 1] === 0 && buffer[index + 2] === 3) {
      bytes.push(0, 0)
      index += 2
    }
    else {
      bytes.push(buffer[index])
    }
  }
  return Buffer.from(bytes)
}

function skipH264ScalingList(bits: BitReader, size: number): void {
  let lastScale = 8
  let nextScale = 8
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) {
      nextScale = (lastScale + bits.readSignedExpGolomb() + 256) % 256
    }
    lastScale = nextScale === 0 ? lastScale : nextScale
  }
}

function getH264CropUnits(chromaFormatIdc: number, frameMbsOnlyFlag: number): { x: number, y: number } {
  if (chromaFormatIdc === 0) {
    return { x: 1, y: 2 - frameMbsOnlyFlag }
  }
  if (chromaFormatIdc === 1) {
    return { x: 2, y: 2 * (2 - frameMbsOnlyFlag) }
  }
  if (chromaFormatIdc === 2) {
    return { x: 2, y: 2 - frameMbsOnlyFlag }
  }
  return { x: 1, y: 2 - frameMbsOnlyFlag }
}

class BitReader {
  private bitOffset = 0

  constructor(private readonly buffer: Buffer) {}

  readBits(count: number): number {
    let value = 0
    for (let index = 0; index < count; index += 1) {
      const byteOffset = this.bitOffset >> 3
      if (byteOffset >= this.buffer.length) {
        throw new Error('Unexpected end of bitstream')
      }
      const bitOffset = 7 - (this.bitOffset & 7)
      value = (value << 1) | ((this.buffer[byteOffset] >> bitOffset) & 1)
      this.bitOffset += 1
    }
    return value
  }

  readUnsignedExpGolomb(): number {
    let leadingZeroBits = 0
    while (this.readBits(1) === 0) {
      leadingZeroBits += 1
    }
    return leadingZeroBits === 0
      ? 0
      : (2 ** leadingZeroBits - 1) + this.readBits(leadingZeroBits)
  }

  readSignedExpGolomb(): number {
    const value = this.readUnsignedExpGolomb()
    return (value & 1) === 0 ? -(value / 2) : (value + 1) / 2
  }
}

function hasGuid(buffer: Buffer, offset: number, guid: Buffer): boolean {
  return buffer.length >= offset + guid.length && buffer.subarray(offset, offset + guid.length).equals(guid)
}

function readUInt64LE(buffer: Buffer, offset: number): number | undefined {
  if (offset + 8 > buffer.length) {
    return undefined
  }

  const value = buffer.readBigUInt64LE(offset)
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined
}

function readAsfUtf16Length(buffer: Buffer, offset: number): number {
  return offset + 2 <= buffer.length ? buffer.readUInt16LE(offset) : 0
}

function readUtf16LeString(buffer: Buffer, offset: number, characters: number): string {
  const byteLength = characters * 2
  if (characters <= 0 || offset + byteLength > buffer.length) {
    return ''
  }
  return buffer.subarray(offset, offset + byteLength).toString('utf16le').replace(/\0+$/g, '').trim()
}

function hasIsoBmffFtyp(buffer: Buffer): boolean {
  return hasAscii(buffer, 4, 'ftyp')
}

function hasMp3FrameSync(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0
}

async function hasLikelyMp3AudioFile(filePath: string, header: Buffer): Promise<boolean> {
  if (hasLikelyMp3Audio(header)) {
    return true
  }

  const id3PayloadEnd = getId3v2PayloadEndOffset(header)
  if (id3PayloadEnd === undefined || id3PayloadEnd < header.length) {
    return false
  }

  return hasLikelyMp3Audio(await readMediaWindow(filePath, id3PayloadEnd, 4096))
}

function hasLikelyMp3Audio(buffer: Buffer): boolean {
  const firstFrameOffset = getMp3FirstFrameOffset(buffer)
  if (firstFrameOffset === undefined) {
    return false
  }

  const firstFrameLength = getMp3FrameLength(buffer, firstFrameOffset)
  if (!firstFrameLength) {
    return false
  }

  const secondFrameOffset = firstFrameOffset + firstFrameLength
  return hasMp3FrameSync(buffer.subarray(secondFrameOffset, secondFrameOffset + 4))
}

function getMp3FirstFrameOffset(buffer: Buffer): number | undefined {
  if (hasAscii(buffer, 0, 'ID3')) {
    if (buffer.length < 10) {
      return undefined
    }
    const tagSize = readSynchsafeInt(buffer, 6)
    const footerSize = (buffer[5] & 0x10) !== 0 ? 10 : 0
    const offset = 10 + tagSize + footerSize
    return offset < buffer.length && hasMp3FrameSync(buffer.subarray(offset, offset + 4))
      ? offset
      : undefined
  }

  return hasMp3FrameSync(buffer.subarray(0, 4)) ? 0 : undefined
}

function getId3v2PayloadEndOffset(buffer: Buffer): number | undefined {
  if (!hasAscii(buffer, 0, 'ID3') || buffer.length < 10) {
    return undefined
  }

  const tagSize = readSynchsafeInt(buffer, 6)
  const footerSize = (buffer[5] & 0x10) !== 0 ? 10 : 0
  return 10 + tagSize + footerSize
}

function getMp3FrameLength(buffer: Buffer, offset: number): number | undefined {
  if (offset + 4 > buffer.length || !hasMp3FrameSync(buffer.subarray(offset, offset + 4))) {
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
  const bitrate = getMp3Bitrate(version, layer, bitrateIndex)
  const sampleRate = getMp3SampleRate(versionBits, sampleRateIndex)
  if (!bitrate || !sampleRate) {
    return undefined
  }

  return layer === 1
    ? Math.floor(((12 * bitrate) / sampleRate + padding) * 4)
    : Math.floor(((version === 1 ? 144 : 72) * bitrate) / sampleRate + padding)
}

function getMp3Bitrate(version: 1 | 2, layer: number, index: number): number | undefined {
  const values = version === 1
    ? layer === 1
      ? [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
      : layer === 2
        ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
        : [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : layer === 1
      ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  const value = values[index]
  return value ? value * 1000 : undefined
}

function getMp3SampleRate(versionBits: number, index: number): number | undefined {
  const values: Record<number, number[]> = {
    0: [11025, 12000, 8000],
    2: [22050, 24000, 16000],
    3: [44100, 48000, 32000],
  }
  return values[versionBits]?.[index]
}

function readSynchsafeInt(buffer: Buffer, offset: number): number {
  return ((buffer[offset] & 0x7F) << 21)
    | ((buffer[offset + 1] & 0x7F) << 14)
    | ((buffer[offset + 2] & 0x7F) << 7)
    | (buffer[offset + 3] & 0x7F)
}

function hasAdtsSync(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0
}

async function getTrackCodecString(track: InputTrack): Promise<string | undefined> {
  const internalCodecId = stringifyCodecValue(await tryValue(() => track.getInternalCodecId()))
  if (internalCodecId) {
    return internalCodecId
  }

  const codecParameterString = stringifyCodecValue(await tryValue(() => track.getCodecParameterString()))
  if (codecParameterString) {
    return codecParameterString
  }

  return stringifyCodecValue(await tryValue(() => track.getCodec()))
}

async function getFileSize(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).size
  }
  catch {
    return undefined
  }
}

function estimateBitrate(fileSize: number | undefined, duration: number): number | undefined {
  if (!fileSize || fileSize <= 0 || duration <= 0 || !Number.isFinite(duration)) {
    return undefined
  }

  return Math.round((fileSize * 8) / duration)
}

async function tryNumber(
  readValue: () => Promise<number | null | undefined>,
  options: { allowZero?: boolean } = {},
): Promise<number | undefined> {
  const value = await tryValue(readValue)
  return options.allowZero
    ? normalizeNonNegativeNumber(value)
    : normalizePositiveNumber(value)
}

async function tryValue<T>(readValue: () => Promise<T>): Promise<T | undefined> {
  try {
    return await readValue()
  }
  catch {
    return undefined
  }
}

function normalizePositiveNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function normalizeNonNegativeNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function stringifyCodecValue(value: string | number | Uint8Array | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (value instanceof Uint8Array) {
    const hexValue = Buffer.from(value).toString('hex')
    return hexValue || undefined
  }

  const text = String(value).trim()
  return text || undefined
}
