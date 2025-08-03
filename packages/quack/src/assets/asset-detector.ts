import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, basename, dirname, relative, join } from 'node:path'
import { glob } from 'glob'
import { lookup } from 'mime-types'
import { createLogger } from '@quajs/logger'
import { isString } from '@quajs/utils'
import { MediaMetadataExtractor } from './media-extractor'
import type { AssetInfo, AssetType, AssetSubType, LocaleInfo } from '../core/types'

const logger = createLogger('quack:asset-detector')

// Locale pattern matching
const LOCALE_PATTERNS = [
  // ISO 639-1 with ISO 3166-1 (e.g., en-US, zh-CN)
  /^([a-z]{2})-([A-Z]{2})$/,
  // ISO 639-1 only (e.g., en, zh)
  /^([a-z]{2})$/,
  // Extended patterns (e.g., zh-Hans-CN)
  /^([a-z]{2})-([A-Za-z]{4})-([A-Z]{2})$/
]

const COMMON_LOCALES = [
  'en', 'en-US', 'en-GB',
  'zh', 'zh-CN', 'zh-TW', 'zh-Hans', 'zh-Hant',
  'ja', 'ja-JP',
  'ko', 'ko-KR',
  'fr', 'fr-FR',
  'de', 'de-DE',
  'es', 'es-ES',
  'it', 'it-IT',
  'pt', 'pt-BR',
  'ru', 'ru-RU'
]

// Asset type detection patterns
const ASSET_PATTERNS = {
  images: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'],
    subTypes: {
      backgrounds: ['background', 'backgrounds', 'bg', 'scene'],
      cg: ['cg', 'event', 'illustration'],
      ui: ['ui', 'interface', 'button', 'panel', 'menu']
    }
  },
  characters: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
    subTypes: {
      sprites: ['sprite', 'sprites', 'character', 'char']
    }
  },
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
    subTypes: {
      sfx: ['sfx', 'sound', 'effect'],
      voice: ['voice', 'dialogue', 'speech'],
      bgm: ['bgm', 'music', 'theme', 'background']
    }
  },
  video: {
    extensions: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
    subTypes: {
      cutscenes: ['cutscene', 'cutscenes', 'movie', 'cinema'],
      effects: ['effect', 'effects', 'fx', 'particle'],
      intro: ['intro', 'opening', 'title', 'credits']
    }
  },
  scripts: {
    extensions: ['.js', '.mjs'],
    subTypes: {
      logic: ['script', 'logic', 'game']
    }
  },
  data: {
    extensions: ['.json', '.xml', '.yaml', '.yml', '.txt', '.csv'],
    subTypes: {
      config: ['config', 'settings', 'options'],
      save: ['save', 'savegame', 'progress']
    }
  }
} as const

export class AssetDetector {
  private ignoredPatterns: string[]
  private mediaExtractor: MediaMetadataExtractor

  constructor(ignoredPatterns: string[] = []) {
    this.ignoredPatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      ...ignoredPatterns
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
      absolute: true
    })

    logger.info(`Found ${files.length} files to process`)

    const assets: AssetInfo[] = []
    
    for (const filePath of files) {
      try {
        const asset = await this.analyzeAsset(filePath, sourcePath)
        if (asset) {
          assets.push(asset)
        }
      } catch (error) {
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
    const dirPath = dirname(relativePath)

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
    let mediaMetadata = undefined
    if (['images', 'characters', 'audio', 'video'].includes(assetType)) {
      try {
        mediaMetadata = await this.mediaExtractor.extractMetadata(filePath)
      } catch (error) {
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
      mediaMetadata
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
    if (pathLower.includes('/scripts/') || pathLower.startsWith('scripts/')) {
      return 'scripts'
    }
    if (pathLower.includes('/data/') || pathLower.startsWith('data/')) {
      return 'data'
    }

    // Check by extension
    for (const [type, config] of Object.entries(ASSET_PATTERNS)) {
      if (config.extensions.includes(extension)) {
        return type as AssetType
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
        if (pathLower.includes(`/${keyword}/`) || 
            pathLower.includes(`${keyword}/`) ||
            nameLower.includes(keyword)) {
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
    // Remove the file extension first to avoid false positives
    const nameParts = fileName.split('.')
    // Remove the last part (file extension) and check the remaining parts
    const partsWithoutExtension = nameParts.slice(0, -1)
    for (const part of partsWithoutExtension) {
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
   * Validate asset file integrity (placeholder implementation)
   */
  public async validateAsset(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath)
      return stats.size > 0
    } catch {
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
      isDefault: code === 'default'
    }))

    // Sort with default first
    return locales.sort((a, b) => {
      if (a.isDefault) return -1
      if (b.isDefault) return 1
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
      'ru': 'Russian'
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
      scripts: {},
      data: {}
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