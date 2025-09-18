export interface QuaEngineVitePluginOptions {
  /** Enable QuaScript compilation */
  scriptCompiler?: {
    enabled?: boolean
    include?: string | RegExp | (string | RegExp)[]
    exclude?: string | RegExp | (string | RegExp)[]
    /** Custom decorator mappings */
    decoratorMappings?: Record<string, any>
    /** Project root for plugin discovery */
    projectRoot?: string
  }

  /** Enable plugin discovery and bundling */
  pluginDiscovery?: {
    enabled?: boolean
    /** Generate virtual plugin registry module */
    generateVirtualRegistry?: boolean
    /** Auto-bundle discovered plugins */
    autoBundlePlugins?: boolean
  }

  /** Enable Quack asset bundling */
  assetBundling?: {
    enabled?: boolean
    /** Source directory for assets */
    source?: string
    /** Output directory for bundles */
    output?: string
    /** Bundle format: 'auto', 'qpk', 'zip' */
    format?: 'auto' | 'qpk' | 'zip'
    /** Compression settings */
    compression?: {
      algorithm?: 'none' | 'deflate' | 'lzma'
      level?: number
    }
    /** Encryption settings */
    encryption?: {
      enabled?: boolean
      algorithm?: 'xor' | 'aes256'
      key?: string
    }
  }

  /** Development server enhancements */
  devServer?: {
    /** Enable hot reload for scripts */
    hotReloadScripts?: boolean
    /** Enable asset watching */
    watchAssets?: boolean
  }
}

export interface VirtualPluginRegistryEntry {
  name: string
  entry: string
  decorators: Record<string, {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  }>
  apis: string[]
}

export interface AssetBundleManifest {
  version: string
  buildNumber: string | number
  totalFiles: number
  totalSize: number
  assets: Record<string, any>
  locales: string[]
  merkleRoot?: string
}
