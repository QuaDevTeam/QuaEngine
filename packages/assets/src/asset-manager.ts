import type { QuaAssetsDatabase } from './database'
import type {
  AssetLocale,
  AssetProcessingPlugin,
  AssetQueryResult,
  AssetType,
  JSExecutionResult,
  LoadAssetOptions,
  MediaMetadata,
  StoredAsset,
} from './types'
import { AssetNotFoundError } from './types'

/**
 * Asset manager handles retrieval and processing of individual assets
 * Supports blob URLs, JavaScript execution, and plugin processing
 */
export class AssetManager {
  private database: QuaAssetsDatabase
  private blobUrlCache = new Map<string, string>()
  private jsCache = new Map<string, JSExecutionResult>()
  private processingPlugins = new Map<AssetType, AssetProcessingPlugin[]>()
  private defaultLocale: AssetLocale

  constructor(database: QuaAssetsDatabase, defaultLocale: AssetLocale = 'default') {
    this.database = database
    this.defaultLocale = defaultLocale

    // Clean up blob URLs when page unloads
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanup()
      })
    }
  }

  /**
   * Register an asset processing plugin
   */
  registerProcessingPlugin(plugin: AssetProcessingPlugin): void {
    for (const type of plugin.supportedTypes) {
      if (!this.processingPlugins.has(type)) {
        this.processingPlugins.set(type, [])
      }
      this.processingPlugins.get(type)!.push(plugin)
    }
  }

  /**
   * Get asset as blob
   */
  async getBlob(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<Blob> {
    const result = await this.getAsset(type, name, options)
    return result.blob
  }

  /**
   * Get asset as blob URL
   */
  async getBlobURL(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<string> {
    const result = await this.getAsset(type, name, options)

    // Check if we already have a blob URL for this asset
    const cacheKey = result.asset.id
    if (this.blobUrlCache.has(cacheKey)) {
      return this.blobUrlCache.get(cacheKey)!
    }

    // Create new blob URL
    const blobUrl = URL.createObjectURL(result.blob)
    this.blobUrlCache.set(cacheKey, blobUrl)

    return blobUrl
  }

  /**
   * Get asset as ArrayBuffer
   */
  async getArrayBuffer(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<ArrayBuffer> {
    const result = await this.getAsset(type, name, options)
    return await result.blob.arrayBuffer()
  }

  /**
   * Get asset as text
   */
  async getText(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<string> {
    const result = await this.getAsset(type, name, options)
    return await result.blob.text()
  }

  /**
   * Get asset as JSON
   */
  async getJSON<T = any>(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<T> {
    const text = await this.getText(type, name, options)
    return JSON.parse(text)
  }

  /**
   * Execute JavaScript asset and return exports
   */
  async executeJS(
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<JSExecutionResult> {
    const result = await this.getAsset('scripts', name, options)

    // Check cache first
    const cacheKey = result.asset.id
    if (this.jsCache.has(cacheKey)) {
      return this.jsCache.get(cacheKey)!
    }

    const startTime = performance.now()
    let executionResult: JSExecutionResult

    try {
      const jsCode = await result.blob.text()
      const exports = await this.executeJavaScript(jsCode, name)

      executionResult = {
        exports,
        executionTime: performance.now() - startTime,
      }
    }
    catch (error) {
      executionResult = {
        exports: null,
        error: error as Error,
        executionTime: performance.now() - startTime,
      }
    }

    // Cache the result
    this.jsCache.set(cacheKey, executionResult)

    return executionResult
  }

  /**
   * Get multiple assets of the same type
   */
  async getBlobBatch(
    type: AssetType,
    names: string[],
    options: LoadAssetOptions = {},
  ): Promise<Map<string, Blob>> {
    const results = new Map<string, Blob>()

    // Use Promise.allSettled to handle partial failures
    const promises = names.map(async (name) => {
      try {
        const blob = await this.getBlob(type, name, options)
        return { name, blob }
      }
      catch (error) {
        console.warn(`Failed to load asset ${type}/${name}:`, error)
        return { name, blob: null }
      }
    })

    const settled = await Promise.allSettled(promises)

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.blob) {
        results.set(result.value.name, result.value.blob)
      }
    }

    return results
  }

  /**
   * Check if asset exists
   */
  async hasAsset(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<boolean> {
    try {
      await this.getAsset(type, name, options)
      return true
    }
    catch (error) {
      return false
    }
  }

  /**
   * Get media metadata for an asset
   */
  async getMediaMetadata(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<MediaMetadata | null> {
    try {
      const result = await this.getAsset(type, name, options)
      return result.asset.mediaMetadata || null
    }
    catch (error) {
      return null
    }
  }

  /**
   * Get asset with locale fallback and processing
   */
  private async getAsset(
    type: AssetType,
    name: string,
    options: LoadAssetOptions = {},
  ): Promise<AssetQueryResult> {
    const locale = options.locale || this.defaultLocale
    const bundleName = options.bundleName

    let asset: StoredAsset | undefined

    if (bundleName) {
      // Look in specific bundle
      asset = await this.database.getAssetWithLocaleFallback(
        bundleName,
        type,
        name,
        locale,
      )
    }
    else {
      // Search across all bundles
      const assets = await this.database.findAssets({ type, name })

      if (assets.length === 0) {
        throw new AssetNotFoundError(type, name)
      }

      // Find best locale match
      asset = this.findBestLocaleMatch(assets, locale)
    }

    if (!asset) {
      throw new AssetNotFoundError(type, name)
    }

    // Apply processing plugins
    const processedAsset = await this.processAsset(asset)

    return {
      asset: processedAsset,
      blob: processedAsset.blob,
      fromCache: true,
    }
  }

  /**
   * Find best locale match from available assets
   */
  private findBestLocaleMatch(assets: StoredAsset[], preferredLocale: AssetLocale): StoredAsset | undefined {
    // First, try exact locale match
    let match = assets.find(asset => asset.locale === preferredLocale)
    if (match)
      return match

    // Then try default locale
    match = assets.find(asset => asset.locale === 'default')
    if (match)
      return match

    // Finally, return any asset
    return assets[0]
  }

  /**
   * Apply processing plugins to asset
   */
  private async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    const plugins = this.processingPlugins.get(asset.type) || []

    let processedAsset = asset
    for (const plugin of plugins) {
      try {
        processedAsset = await plugin.processAsset(processedAsset)
      }
      catch (error) {
        console.warn(`Asset processing plugin ${plugin.name} failed:`, error)
      }
    }

    return processedAsset
  }

  /**
   * Execute JavaScript code in isolated scope and return exports
   */
  private async executeJavaScript(code: string, filename: string): Promise<any> {
    // Create isolated execution context
    const exports: any = {}
    const module = { exports }

    try {
      // Wrap code to transform exports into assignments
      // Handle both CommonJS and ES module styles
      const wrappedCode = this.wrapJavaScriptCode(code)

      // Create function with controlled scope
      // eslint-disable-next-line no-new-func
      const executeFunction = new Function(
        'exports',
        'module',
        'require',
        'console',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        wrappedCode,
      )

      // Create limited require function
      const requireFn = (moduleId: string) => {
        throw new Error(`Module '${moduleId}' is not available in asset execution context`)
      }

      // Execute with controlled environment
      const result = executeFunction(
        exports,
        module,
        requireFn,
        console, // Allow console for debugging
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
      )

      // Return exports (could be module.exports if reassigned)
      return module.exports !== exports ? module.exports : (result !== undefined ? result : exports)
    }
    catch (error) {
      throw new Error(`JavaScript execution failed in ${filename}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Wrap JavaScript code to handle various module formats
   */
  private wrapJavaScriptCode(code: string): string {
    // Handle minimized code and various export patterns
    let wrappedCode = code

    // If code contains 'export', wrap it to capture exports
    if (code.includes('export ')) {
      wrappedCode = `
        const __exports = {};
        ${code.replace(/export\s+default\s+/g, '__exports.default = ')
          .replace(/export\s+\{([^}]+)\}/g, (_, namedExports) => {
            return namedExports.split(',').map((exp: string) => {
              const [name, alias] = exp.trim().split(' as ')
              const exportName = alias || name
              return `__exports.${exportName.trim()} = ${name.trim()};`
            }).join('\n')
          })
          .replace(/export\s+const\s+(\w+)/g, '__exports.$1 = const $1')
          .replace(/export\s+let\s+(\w+)/g, '__exports.$1 = let $1')
          .replace(/export\s+var\s+(\w+)/g, '__exports.$1 = var $1')
          .replace(/export\s+function\s+(\w+)/g, 'function $1')
          .replace(/export\s+class\s+(\w+)/g, 'class $1')}
        
        // Copy function and class declarations to exports
        ${this.extractDeclarations(code)}
        
        return __exports;
      `
    }
    else if (code.includes('module.exports')) {
      // CommonJS style - just execute
      wrappedCode = code
    }
    else {
      // Assume it's a function or expression, return the result
      wrappedCode = `return (${code});`
    }

    return wrappedCode
  }

  /**
   * Extract function and class declarations to add to exports
   */
  private extractDeclarations(code: string): string {
    const declarations: string[] = []

    // Extract function declarations
    const functionMatches = code.match(/export\s+function\s+(\w+)/g)
    if (functionMatches) {
      for (const match of functionMatches) {
        const name = match.replace(/export\s+function\s+/, '')
        declarations.push(`__exports.${name} = ${name};`)
      }
    }

    // Extract class declarations
    const classMatches = code.match(/export\s+class\s+(\w+)/g)
    if (classMatches) {
      for (const match of classMatches) {
        const name = match.replace(/export\s+class\s+/, '')
        declarations.push(`__exports.${name} = ${name};`)
      }
    }

    return declarations.join('\n')
  }

  /**
   * Clear cached blob URLs and JS execution results
   */
  cleanup(): void {
    // Revoke all blob URLs to free memory
    for (const [, blobUrl] of this.blobUrlCache) {
      URL.revokeObjectURL(blobUrl)
    }

    this.blobUrlCache.clear()
    this.jsCache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    blobUrls: number
    jsExecutions: number
  } {
    return {
      blobUrls: this.blobUrlCache.size,
      jsExecutions: this.jsCache.size,
    }
  }

  /**
   * Clear specific asset from caches
   */
  clearAssetCache(assetId: string): void {
    const blobUrl = this.blobUrlCache.get(assetId)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      this.blobUrlCache.delete(assetId)
    }

    this.jsCache.delete(assetId)
  }

  /**
   * Preload assets for better performance
   */
  async preloadAssets(requests: Array<{
    type: AssetType
    name: string
    options?: LoadAssetOptions
  }>): Promise<void> {
    const promises = requests.map(({ type, name, options }) =>
      this.getAsset(type, name, options).catch((error) => {
        console.warn(`Failed to preload asset ${type}/${name}:`, error)
      }),
    )

    await Promise.allSettled(promises)
  }
}
