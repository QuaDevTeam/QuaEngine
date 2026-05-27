import type { AssetInfo, AssetSubType, AssetType, LocaleInfo, MediaMetadata } from '../core/types'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { createLogger } from '@quajs/logger'
import { isString } from '@quajs/utils'
import { glob } from 'glob'
import { lookup } from 'mime-types'
import { MediaMetadataExtractor } from './media-extractor'

const logger = createLogger('quack:asset-detector')

// Locale pattern matching
const LOCALE_PATTERNS = [
  // ISO 639-1 with ISO 3166-1 (e.g., en-US, zh-CN)
  /^([a-z]{2})-([A-Z]{2})$/,
  // ISO 639-1 only (e.g., en, zh)
  /^([a-z]{2})$/,
  // Extended patterns (e.g., zh-Hans-CN)
  /^([a-z]{2})-([A-Za-z]{4})-([A-Z]{2})$/,
]

const COMMON_LOCALES = [
  'en',
  'en-US',
  'en-GB',
  'zh',
  'zh-CN',
  'zh-TW',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ja-JP',
  'ko',
  'ko-KR',
  'fr',
  'fr-FR',
  'de',
  'de-DE',
  'es',
  'es-ES',
  'it',
  'it-IT',
  'pt',
  'pt-BR',
  'ru',
  'ru-RU',
]

// Asset type detection patterns
const ASSET_PATTERNS = {
  images: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'],
    subTypes: {
      backgrounds: ['background', 'backgrounds', 'bg', 'scene'],
      cg: ['cg', 'event', 'illustration'],
      ui: ['ui', 'interface', 'button', 'panel', 'menu'],
    },
  },
  characters: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
    subTypes: {
      sprites: ['sprite', 'sprites', 'character', 'char', 'characters'],
    },
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
    subTypes: {
      sfx: ['sfx', 'sound', 'effect'],
      voice: ['voice', 'dialogue', 'speech'],
      bgm: ['bgm', 'music', 'theme', 'background'],
    },
  },
  video: {
    extensions: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
    subTypes: {
      cutscenes: ['cutscene', 'cutscenes', 'movie', 'cinema'],
      effects: ['effect', 'effects', 'fx', 'particle'],
      intro: ['intro', 'opening', 'title', 'credits'],
    },
  },
  fonts: {
    extensions: ['.woff2', '.woff', '.ttf', '.otf', '.ttc'],
    subTypes: {
      typefaces: ['typeface', 'typefaces', 'font', 'fonts'],
      fontFamilies: ['family', 'families', 'font-family', 'font-families'],
    },
  },
  scripts: {
    extensions: ['.js', '.mjs', '.qs'],
    subTypes: {
      logic: ['script', 'logic', 'game'],
    },
  },
  data: {
    extensions: ['.json', '.xml', '.yaml', '.yml', '.txt', '.csv'],
    subTypes: {
      config: ['config', 'settings', 'options'],
      save: ['save', 'savegame', 'progress'],
    },
  },
} as const

export class AssetDetector {
  private ignoredPatterns: string[]
  private mediaExtractor: MediaMetadataExtractor

  constructor(ignoredPatterns: string[] = []) {
    this.ignoredPatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.quack/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.psd',
      '**/*.psb',
      '**/ui-skin.json',
      '**/*.qs.sync.json',
      '**/*.qsync.json',
      '**/*.tmp',
      '**/*.temp',
      ...ignoredPatterns,
    ]
    this.mediaExtractor = new MediaMetadataExtractor()
  }

  /**
   * Discover all assets in a directory
   */
  async discoverAssets(sourcePath: string): Promise<AssetInfo[]> {
    logger.info(`Discovering assets in: ${sourcePath}`)

    const pattern = join(sourcePath, '**/*').replace(/\\/g, '/')
    const files = await glob(pattern, {
      ignore: this.ignoredPatterns,
      nodir: true,
      absolute: true,
    })

    logger.info(`Found ${files.length} files to process`)

    const assets: AssetInfo[] = []

    for (const filePath of files) {
      try {
        const asset = await this.analyzeAsset(filePath, sourcePath)
        if (asset) {
          assets.push(asset)
        }
      }
      catch (error) {
        logger.warn(`Failed to analyze asset: ${filePath}`, error)
      }
    }

    logger.info(`Discovered ${assets.length} valid assets`)
    return assets
  }

  /**
   * Analyze a single asset file
   */
  async analyzeAsset(filePath: string, basePath: string): Promise<AssetInfo | null> {
    const stats = await stat(filePath)
    if (!stats.isFile()) {
      return null
    }

    const relativePath = relative(basePath, filePath).replace(/\\/g, '/')
    const extension = extname(filePath).toLowerCase()
    const fileName = basename(filePath, extension)
    // Detect asset type
    const assetType = this.detectAssetType(relativePath, extension)
    if (!assetType) {
      logger.debug(`Skipping unrecognized asset: ${relativePath}`)
      return null
    }

    // Detect locales
    const locales = this.detectLocales(relativePath, fileName)

    // Detect sub-type
    const subType = this.detectSubType(assetType, relativePath, fileName)

    // Calculate hash
    const buffer = await readFile(filePath)
    const hash = this.calculateHash(buffer)

    // Get MIME type
    const mimeType = lookup(extension) || undefined

    // Extract media metadata for supported types
    let mediaMetadata: MediaMetadata | undefined
    if (['images', 'characters', 'audio', 'video'].includes(assetType)) {
      try {
        mediaMetadata = await this.mediaExtractor.extractMetadata(filePath) || undefined
      }
      catch (error) {
        logger.warn(`Failed to extract media metadata for ${relativePath}:`, error)
      }
    }

    return {
      name: basename(filePath),
      path: filePath,
      relativePath,
      size: stats.size,
      hash,
      type: assetType,
      subType,
      locales,
      mimeType,
      mediaMetadata,
    }
  }

  /**
   * Detect asset type based on file path and extension
   */
  private detectAssetType(relativePath: string, extension: string): AssetType | null {
    const pathLower = relativePath.toLowerCase()

    // Check by folder structure first
    if (pathLower.includes('/characters/') || pathLower.startsWith('characters/')) {
      return 'characters'
    }
    if (pathLower.includes('/images/') || pathLower.startsWith('images/')) {
      return 'images'
    }
    if (pathLower.includes('/audio/') || pathLower.startsWith('audio/')) {
      return 'audio'
    }
    if (pathLower.includes('/video/') || pathLower.startsWith('video/')) {
      return 'video'
    }
    if (pathLower.includes('/fonts/') || pathLower.startsWith('fonts/')) {
      return 'fonts'
    }
    if (pathLower.includes('/scripts/') || pathLower.startsWith('scripts/')) {
      return 'scripts'
    }
    if (pathLower.includes('/data/') || pathLower.startsWith('data/')) {
      return 'data'
    }

    // Check by extension
    for (const [type, config] of Object.entries(ASSET_PATTERNS) as Array<[AssetType, any]>) {
      if (config.extensions.includes(extension)) {
        return type
      }
    }

    return null
  }

  /**
   * Detect asset sub-type
   */
  private detectSubType(assetType: AssetType, relativePath: string, fileName: string): AssetSubType | undefined {
    const pathLower = relativePath.toLowerCase()
    const nameLower = fileName.toLowerCase()

    const typeConfig = ASSET_PATTERNS[assetType]
    if (!typeConfig?.subTypes) {
      return undefined
    }

    for (const [subType, keywords] of Object.entries(typeConfig.subTypes)) {
      for (const keyword of keywords) {
        if (pathLower.includes(`/${keyword}/`)
          || pathLower.includes(`${keyword}/`)
          || nameLower.includes(keyword)) {
          return subType as AssetSubType
        }
      }
    }

    return undefined
  }

  /**
   * Detect locales from file path and name
   */
  private detectLocales(relativePath: string, fileName: string): string[] {
    const locales = new Set<string>()

    // Check folder-based locales (e.g., /en-us/file.png)
    const pathParts = relativePath.split('/')
    for (const part of pathParts) {
      if (this.isValidLocale(part)) {
        locales.add(this.normalizeLocale(part))
      }
    }

    // Check file-based locales (e.g., file.en-us.png)
    const rawName = basename(relativePath)
    const extension = extname(rawName)
    const nameWithoutExtension = extension ? rawName.slice(0, -extension.length) : fileName
    const nameParts = nameWithoutExtension.split('.')
    for (const part of nameParts.slice(1)) {
      if (this.isValidLocale(part)) {
        locales.add(this.normalizeLocale(part))
      }
    }

    // If no locales found, use default
    if (locales.size === 0) {
      locales.add('default')
    }

    return Array.from(locales)
  }

  /**
   * Check if a string is a valid locale identifier
   */
  private isValidLocale(str: string): boolean {
    if (!isString(str) || str.length < 2) {
      return false
    }

    const lower = str.toLowerCase()

    // Check against common locales first
    if (COMMON_LOCALES.some(locale => locale.toLowerCase() === lower)) {
      return true
    }

    // Check against patterns
    return LOCALE_PATTERNS.some(pattern => pattern.test(str))
  }

  /**
   * Normalize locale to lowercase with hyphens
   */
  private normalizeLocale(locale: string): string {
    return locale.toLowerCase().replace(/_/g, '-')
  }

  /**
   * Calculate SHA-256 hash of buffer
   */
  public calculateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
  }

  /**
   * Validate asset file integrity using extension-aware signatures and parsers.
   */
  public async validateAsset(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath)
      if (!stats.isFile() || stats.size <= 0) {
        return false
      }
      const extension = extname(filePath).toLowerCase()
      const assetType = this.detectAssetType(filePath, extension)
      if (!assetType) {
        return false
      }
      const buffer = await readFile(filePath)
      return validateAssetBuffer(buffer, extension, assetType)
    }
    catch {
      return false
    }
  }

  /**
   * Get all unique locales from assets
   */
  getLocalesFromAssets(assets: AssetInfo[]): LocaleInfo[] {
    const localeSet = new Set<string>()

    for (const asset of assets) {
      for (const locale of asset.locales) {
        localeSet.add(locale)
      }
    }

    const locales = Array.from(localeSet).map(code => ({
      code,
      name: this.getLocaleName(code),
      isDefault: code === 'default',
    }))

    // Sort with default first
    return locales.sort((a, b) => {
      if (a.isDefault)
        return -1
      if (b.isDefault)
        return 1
      return a.code.localeCompare(b.code)
    })
  }

  /**
   * Get human-readable name for locale
   */
  private getLocaleName(code: string): string {
    const names: Record<string, string> = {
      'default': 'Default',
      'en': 'English',
      'en-us': 'English (US)',
      'en-gb': 'English (UK)',
      'zh': 'Chinese',
      'zh-cn': 'Chinese (Simplified)',
      'zh-tw': 'Chinese (Traditional)',
      'ja': 'Japanese',
      'ja-jp': 'Japanese (Japan)',
      'ko': 'Korean',
      'ko-kr': 'Korean (Korea)',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
    }

    return names[code.toLowerCase()] || code.toUpperCase()
  }

  /**
   * Group assets by type and subtype
   */
  groupAssets(assets: AssetInfo[]): Record<AssetType, Record<string, AssetInfo[]>> {
    const grouped: Record<AssetType, Record<string, AssetInfo[]>> = {
      images: {},
      characters: {},
      audio: {},
      video: {},
      fonts: {},
      scripts: {},
      data: {},
    }

    for (const asset of assets) {
      const type = asset.type
      const subType = asset.subType || 'other'

      if (!grouped[type][subType]) {
        grouped[type][subType] = []
      }

      grouped[type][subType].push(asset)
    }

    return grouped
  }
}

function validateAssetBuffer(buffer: Buffer, extension: string, assetType: AssetType): boolean {
  if (buffer.length === 0) {
    return false
  }
  switch (assetType) {
    case 'images':
    case 'characters':
      return validateImageBuffer(buffer, extension)
    case 'audio':
      return validateAudioBuffer(buffer, extension)
    case 'video':
      return validateVideoBuffer(buffer, extension)
    case 'fonts':
      return validateFontBuffer(buffer, extension)
    case 'scripts':
      return validateScriptBuffer(buffer, extension)
    case 'data':
      return validateDataBuffer(buffer, extension)
  }
}

function validateImageBuffer(buffer: Buffer, extension: string): boolean {
  switch (extension) {
    case '.png':
      return buffer.length >= 33
        && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        && buffer.subarray(12, 16).equals(Buffer.from('IHDR'))
        && buffer.readUInt32BE(16) > 0
        && buffer.readUInt32BE(20) > 0
    case '.jpg':
    case '.jpeg':
      return buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8 && findJpegSize(buffer) !== undefined
    case '.gif':
      return buffer.length >= 10
        && (buffer.subarray(0, 6).equals(Buffer.from('GIF87a')) || buffer.subarray(0, 6).equals(Buffer.from('GIF89a')))
        && buffer.readUInt16LE(6) > 0
        && buffer.readUInt16LE(8) > 0
    case '.webp':
      return buffer.length >= 30
        && buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
        && buffer.subarray(8, 12).equals(Buffer.from('WEBP'))
        && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.subarray(12, 16).toString('ascii'))
    case '.bmp':
      return buffer.length >= 30
        && buffer.subarray(0, 2).equals(Buffer.from('BM'))
        && buffer.readUInt32LE(18) > 0
        && Math.abs(buffer.readInt32LE(22)) > 0
    case '.svg':
      return /<svg[\s>]/i.test(buffer.toString('utf8'))
    default:
      return false
  }
}

function findJpegSize(buffer: Buffer): { width: number, height: number } | undefined {
  let offset = 2
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    if (marker >= 0xC0 && marker <= 0xC3) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      return width > 0 && height > 0 ? { width, height } : undefined
    }
    const length = buffer.readUInt16BE(offset + 2)
    if (length <= 0) {
      return undefined
    }
    offset += length + 2
  }
  return undefined
}

function validateAudioBuffer(buffer: Buffer, extension: string): boolean {
  switch (extension) {
    case '.wav':
      return buffer.length >= 44
        && buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
        && buffer.subarray(8, 12).equals(Buffer.from('WAVE'))
    case '.mp3':
      return hasMp3Frame(buffer)
    case '.ogg':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('OggS'))
    case '.flac':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('fLaC'))
    case '.m4a':
      return hasMp4Ftyp(buffer)
    case '.aac':
      return buffer.length >= 2 && buffer[0] === 0xFF && (buffer[1] & 0xF6) === 0xF0
    default:
      return false
  }
}

function hasMp3Frame(buffer: Buffer): boolean {
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (buffer[index] === 0xFF && (buffer[index + 1] & 0xE0) === 0xE0) {
      const versionBits = (buffer[index + 1] >> 3) & 0x03
      const layerBits = (buffer[index + 1] >> 1) & 0x03
      const bitrateIndex = (buffer[index + 2] >> 4) & 0x0F
      const sampleRateIndex = (buffer[index + 2] >> 2) & 0x03
      if (versionBits !== 1 && layerBits !== 0 && bitrateIndex > 0 && bitrateIndex < 0x0F && sampleRateIndex < 0x03) {
        return true
      }
    }
  }
  return false
}

function validateVideoBuffer(buffer: Buffer, extension: string): boolean {
  switch (extension) {
    case '.mp4':
    case '.mov':
      return hasMp4Ftyp(buffer)
    case '.webm':
    case '.mkv':
      return buffer.length >= 4 && buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3
    case '.avi':
      return buffer.length >= 12
        && buffer.subarray(0, 4).equals(Buffer.from('RIFF'))
        && buffer.subarray(8, 12).equals(Buffer.from('AVI '))
    case '.wmv':
      return buffer.length >= 16 && buffer.subarray(0, 16).equals(Buffer.from([
        0x30,
        0x26,
        0xB2,
        0x75,
        0x8E,
        0x66,
        0xCF,
        0x11,
        0xA6,
        0xD9,
        0x00,
        0xAA,
        0x00,
        0x62,
        0xCE,
        0x6C,
      ]))
    case '.flv':
      return buffer.length >= 9 && buffer.subarray(0, 3).equals(Buffer.from('FLV'))
    default:
      return false
  }
}

function hasMp4Ftyp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).equals(Buffer.from('ftyp'))
}

function validateFontBuffer(buffer: Buffer, extension: string): boolean {
  if (extension === '.woff') {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('wOFF'))
  }
  if (extension === '.woff2') {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('wOF2'))
  }
  if (extension === '.otf') {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('OTTO'))
  }
  if (extension === '.ttc') {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('ttcf'))
  }
  if (extension === '.ttf') {
    return buffer.length >= 4 && buffer.readUInt32BE(0) === 0x00010000
  }
  return false
}

function validateScriptBuffer(buffer: Buffer, extension: string): boolean {
  if (extension === '.qs') {
    return buffer.toString('utf8').trim().length > 0
  }
  if (extension === '.js' || extension === '.mjs') {
    return buffer.toString('utf8').trim().length > 0
  }
  return false
}

function validateDataBuffer(buffer: Buffer, extension: string): boolean {
  const source = buffer.toString('utf8').trim()
  if (source.length === 0) {
    return false
  }
  if (extension === '.json') {
    try {
      JSON.parse(source)
      return true
    }
    catch {
      return false
    }
  }
  if (extension === '.xml') {
    return /^<\?xml[\s?>]|^<[\w:-]+[\s>]/.test(source)
  }
  return ['.yaml', '.yml', '.txt', '.csv'].includes(extension)
}
