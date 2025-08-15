import type { AssetContext, BundleManifest, QuackConfig } from '../core/types'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLogger } from '@quajs/logger'
import { QuackPlugin } from '../core/types'

const logger = createLogger('quack:plugins:bundle-analyzer')

export class BundleAnalyzerPlugin extends QuackPlugin {
  name = 'bundle-analyzer'
  version = '1.0.0'

  private outputPath?: string
  private assets: AssetContext[] = []
  private startTime = 0

  constructor(options: {
    outputPath?: string
  } = {}) {
    super()
    this.outputPath = options.outputPath
  }

  async initialize(config: QuackConfig): Promise<void> {
    this.assets = []
    this.startTime = Date.now()

    if (!this.outputPath && config.output) {
      // Default to bundle directory
      this.outputPath = join(dirname(config.output), 'bundle-analysis.json')
    }

    logger.info(`Bundle analyzer plugin initialized${this.outputPath ? ` (output: ${this.outputPath})` : ''}`)
  }

  async processAsset(context: AssetContext): Promise<void> {
    // Store asset context for analysis
    this.assets.push({
      asset: { ...context.asset },
      buffer: Buffer.from(context.buffer), // Copy to avoid references
      metadata: { ...context.metadata },
    })
  }

  async postBundle(bundlePath: string, manifest: BundleManifest): Promise<void> {
    const endTime = Date.now()
    const processingTime = endTime - this.startTime

    const analysis = this.generateAnalysis(bundlePath, manifest, processingTime)

    if (this.outputPath) {
      await writeFile(this.outputPath, JSON.stringify(analysis, null, 2), 'utf8')
      logger.info(`Bundle analysis saved to: ${this.outputPath}`)
    }

    // Log summary
    this.logSummary(analysis)
  }

  private generateAnalysis(bundlePath: string, manifest: BundleManifest, processingTime: number) {
    const assetsByType = this.groupAssetsByType()
    const assetsByLocale = this.groupAssetsByLocale()
    const sizeAnalysis = this.analyzeSizes()

    return {
      timestamp: new Date().toISOString(),
      bundlePath,
      processingTime,
      manifest: {
        version: manifest.version,
        format: manifest.format,
        totalFiles: manifest.totalFiles,
        totalSize: manifest.totalSize,
        locales: manifest.locales,
      },
      assets: {
        total: this.assets.length,
        byType: assetsByType,
        byLocale: assetsByLocale,
      },
      size: sizeAnalysis,
      compression: manifest.compression,
      encryption: manifest.encryption,
      topAssets: this.getTopAssets(10),
      duplicates: this.findDuplicates(),
      recommendations: this.generateRecommendations(sizeAnalysis),
    }
  }

  private groupAssetsByType() {
    const groups: Record<string, { count: number, size: number, assets: string[] }> = {}

    for (const context of this.assets) {
      const type = context.asset.type
      if (!groups[type]) {
        groups[type] = { count: 0, size: 0, assets: [] }
      }

      groups[type].count++
      groups[type].size += context.asset.size
      groups[type].assets.push(context.asset.relativePath)
    }

    return groups
  }

  private groupAssetsByLocale() {
    const groups: Record<string, { count: number, size: number }> = {}

    for (const context of this.assets) {
      for (const locale of context.asset.locales) {
        if (!groups[locale]) {
          groups[locale] = { count: 0, size: 0 }
        }

        groups[locale].count++
        groups[locale].size += context.asset.size
      }
    }

    return groups
  }

  private analyzeSizes() {
    const sizes = this.assets.map(c => c.asset.size).sort((a, b) => b - a)
    const totalSize = sizes.reduce((sum, size) => sum + size, 0)

    return {
      total: totalSize,
      average: Math.round(totalSize / sizes.length),
      median: sizes[Math.floor(sizes.length / 2)] || 0,
      largest: sizes[0] || 0,
      smallest: sizes[sizes.length - 1] || 0,
      distribution: {
        under1KB: sizes.filter(s => s < 1024).length,
        under10KB: sizes.filter(s => s < 10240).length,
        under100KB: sizes.filter(s => s < 102400).length,
        under1MB: sizes.filter(s => s < 1048576).length,
        over1MB: sizes.filter(s => s >= 1048576).length,
      },
    }
  }

  private getTopAssets(count: number) {
    return this.assets
      .sort((a, b) => b.asset.size - a.asset.size)
      .slice(0, count)
      .map(context => ({
        path: context.asset.relativePath,
        type: context.asset.type,
        size: context.asset.size,
        locales: context.asset.locales,
        optimized: context.metadata.optimized || false,
        savedBytes: context.metadata.savedBytes || 0,
      }))
  }

  private findDuplicates() {
    const hashMap = new Map<string, string[]>()

    for (const context of this.assets) {
      const hash = context.asset.hash
      if (!hashMap.has(hash)) {
        hashMap.set(hash, [])
      }
      hashMap.get(hash)!.push(context.asset.relativePath)
    }

    // Return only duplicates
    const duplicates: Array<{ hash: string, files: string[], size: number }> = []
    for (const [hash, files] of hashMap) {
      if (files.length > 1) {
        const size = this.assets.find(c => c.asset.hash === hash)?.asset.size || 0
        duplicates.push({ hash, files, size })
      }
    }

    return duplicates.sort((a, b) => b.size - a.size)
  }

  private generateRecommendations(sizeAnalysis: any) {
    const recommendations: string[] = []

    // Large file recommendations
    if (sizeAnalysis.largest > 5 * 1024 * 1024) { // 5MB
      recommendations.push('Consider compressing or splitting large assets over 5MB')
    }

    // Many small files
    if (sizeAnalysis.distribution.under1KB > this.assets.length * 0.3) {
      recommendations.push('Consider bundling small assets (under 1KB) to reduce file count')
    }

    // Duplicates
    const duplicates = this.findDuplicates()
    if (duplicates.length > 0) {
      recommendations.push(`Found ${duplicates.length} duplicate file groups - consider deduplication`)
    }

    // Optimization
    const imageAssets = this.assets.filter(c => c.asset.type === 'images')
    const optimizedImages = imageAssets.filter(c => c.metadata.optimized)
    if (optimizedImages.length < imageAssets.length * 0.8) {
      recommendations.push('Consider using image optimization plugins for better compression')
    }

    return recommendations
  }

  private logSummary(analysis: any) {
    logger.info('=== Bundle Analysis Summary ===')
    logger.info(`Total assets: ${analysis.assets.total}`)
    logger.info(`Total size: ${this.formatBytes(analysis.size.total)}`)
    logger.info(`Processing time: ${analysis.processingTime}ms`)
    logger.info(`Average file size: ${this.formatBytes(analysis.size.average)}`)

    if (analysis.duplicates.length > 0) {
      logger.warn(`Found ${analysis.duplicates.length} duplicate file groups`)
    }

    if (analysis.recommendations.length > 0) {
      logger.info('Recommendations:')
      for (const rec of analysis.recommendations) {
        logger.info(`  - ${rec}`)
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0)
      return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }
}
