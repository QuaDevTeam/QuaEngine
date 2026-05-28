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

    if (isFormatOnlyVideoExtension(ext)) {
      return metadata
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

function isFormatOnlyVideoExtension(ext: string): boolean {
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

function hasAscii(buffer: Buffer, offset: number, value: string): boolean {
  return buffer.length >= offset + value.length && buffer.subarray(offset, offset + value.length).equals(Buffer.from(value))
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
