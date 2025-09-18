// Re-export base plugin classes
export { QuackPlugin } from '../core/types'
export type { EncryptionPlugin } from '../core/types'
export { BundleAnalyzerPlugin } from './bundle-analyzer'

export { AESEncryptionPlugin, MultiLayerEncryptionPlugin, SimpleRotationPlugin } from './encryption'
export { ImageOptimizationPlugin } from './image-optimization'
