// Re-export base plugin classes
export { QuackPlugin } from '../core/types'
export type { EncryptionPlugin } from '../core/types'
export { AssetPipelinePlugin, type AssetPipelinePluginOptions } from './asset-pipeline'
export { BundleAnalyzerPlugin } from './bundle-analyzer'

export { AESEncryptionPlugin, MultiLayerEncryptionPlugin, SimpleRotationPlugin } from './encryption'
export {
  type ImageOptimizationFormat,
  ImageOptimizationPlugin,
  type ImageOptimizationPluginOptions,
  type PngquantOptions,
} from './image-optimization'
