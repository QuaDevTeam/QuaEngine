import type { CompressionAlgorithm, EncryptionAlgorithm, QuackPlugin } from '@quajs/quack'
import type { PluginOption } from 'vite'

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
    /** Serve assets through a development VFS instead of bundling during dev */
    devVfs?: boolean
    /** Base route for the development VFS */
    devVfsBase?: string
    /** Compression settings */
    compression?: {
      algorithm?: CompressionAlgorithm
      level?: number
    }
    /** Encryption settings */
    encryption?: {
      enabled?: boolean
      algorithm?: EncryptionAlgorithm
      key?: string
    }
    /** Quack plugins contributed by feature packages */
    plugins?: readonly QuackPlugin[]
  }

  /** Additional Vite plugins contributed by feature packages */
  vitePlugins?: readonly PluginOption[]

  /** Web packaging security helpers for CSP, SRI, and runtime module policies */
  webSecurity?: {
    enabled?: boolean
    csp?: {
      mode?: 'hash' | 'nonce' | 'both'
      allowRuntimeBlobModules?: boolean
      trustedTypes?: boolean
      connectSrc?: string[]
      reportUri?: string
    }
    sri?: {
      enabled?: boolean
      algorithm?: 'sha384' | 'sha512'
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
