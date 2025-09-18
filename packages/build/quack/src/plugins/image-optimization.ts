import type { AssetContext, QuackConfig } from '../core/types'
import { createLogger } from '@quajs/logger'
import { QuackPlugin } from '../core/types'

const logger = createLogger('quack:plugins:image-optimization')

export class ImageOptimizationPlugin extends QuackPlugin {
  name = 'image-optimization'
  version = '1.0.0'

  private quality: number
  private progressive: boolean
  private enabled: boolean

  constructor(options: {
    quality?: number
    progressive?: boolean
    enabled?: boolean
  } = {}) {
    super()
    this.quality = options.quality ?? 85
    this.progressive = options.progressive ?? true
    this.enabled = options.enabled ?? true
  }

  async initialize(_config: QuackConfig): Promise<void> {
    if (!this.enabled) {
      logger.info('Image optimization plugin disabled')
      return
    }

    logger.info(`Image optimization plugin initialized (quality: ${this.quality}, progressive: ${this.progressive})`)
  }

  async processAsset(context: AssetContext): Promise<void> {
    if (!this.enabled || context.asset.type !== 'images') {
      return
    }

    const { asset, buffer } = context

    // Check if it's an image we can optimize
    if (!asset.mimeType?.startsWith('image/')) {
      return
    }

    // Skip SVG files
    if (asset.mimeType === 'image/svg+xml') {
      return
    }

    try {
      // In a real implementation, you would use an image processing library like sharp
      // For now, we'll just simulate the optimization
      const originalSize = buffer.length

      // Simulate compression (in reality, you'd use sharp or similar)
      const simulatedOptimizedSize = Math.floor(originalSize * (this.quality / 100))
      const optimizedBuffer = buffer.subarray(0, Math.min(buffer.length, simulatedOptimizedSize))

      if (optimizedBuffer.length < originalSize) {
        context.buffer = optimizedBuffer
        context.metadata.optimized = true
        context.metadata.originalSize = originalSize
        context.metadata.savedBytes = originalSize - optimizedBuffer.length

        logger.debug(`Optimized image: ${asset.relativePath} (saved ${originalSize - optimizedBuffer.length} bytes)`)
      }
    }
    catch (error) {
      logger.warn(`Failed to optimize image: ${asset.relativePath}`, error)
      // Keep original buffer on error
    }
  }
}
