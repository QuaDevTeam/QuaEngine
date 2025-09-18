import type { HotReloadEvent } from '../core/hot-reload'
import type { CompilerOptions, DecoratorMapping } from '../core/types'
import process from 'node:process'
import { getDiscoveredDecoratorMappings } from '@quajs/plugin-discovery'
import { getHotReloadManager } from '../core/hot-reload'
import { QuaScriptTransformer } from '../core/transformer'
import { mergeDecoratorMappings } from '../core/types'

/**
 * Get plugin decorators using the discovery system
 */
async function getPluginDecorators(projectRoot?: string): Promise<DecoratorMapping> {
  try {
    return await getDiscoveredDecoratorMappings(projectRoot)
  }
  catch {
    return {}
  }
}

/**
 * Hot-reload aware QuaScript transformer
 * Supports incremental compilation, caching, and plugin hot-reload
 */
export class HotReloadAwareTransformer extends QuaScriptTransformer {
  private projectRoot?: string
  private hotReloadManager = getHotReloadManager()
  private isInitialized = false

  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: CompilerOptions & { projectRoot?: string },
  ) {
    // Merge with default mappings first
    const initialMappings = mergeDecoratorMappings(decoratorMappings || {})
    super(initialMappings, options)
    this.projectRoot = options?.projectRoot

    // Enable hot-reload in development
    if (process.env.NODE_ENV !== 'production') {
      this.hotReloadManager.enable()
    }

    // Set up hot-reload callbacks
    this.setupHotReload()

    // Load plugins and initialize
    this.initialize()
  }

  /**
   * Transform source with hot-reload support
   */
  transformSource(source: string, filePath?: string): string {
    if (!this.hotReloadManager.isHotReloadEnabled() || !filePath) {
      return super.transformSource(source)
    }

    // Check cache first
    const cached = this.hotReloadManager.getCached(filePath, source)
    if (cached) {
      return cached
    }

    // Transform and cache result
    const result = super.transformSource(source)

    // Extract dependencies (files that this QuaScript depends on)
    const dependencies = this.extractDependencies(source)
    this.hotReloadManager.setCached(filePath, source, result, dependencies)

    return result
  }

  /**
   * Get current decorator mappings (for hot-reload updates)
   */
  getCurrentDecoratorMappings(): DecoratorMapping {
    return { ...this.decoratorMappings }
  }

  /**
   * Update decorator mappings (triggered by hot-reload)
   */
  async updateDecoratorMappings(): Promise<void> {
    try {
      const pluginDecorators = await getPluginDecorators(this.projectRoot)
      const updatedMappings = mergeDecoratorMappings(pluginDecorators)

      // Update internal mappings
      this.decoratorMappings = updatedMappings

      // Notify hot-reload manager
      this.hotReloadManager.updateDecoratorMappings(updatedMappings)
    }
    catch (error) {
      console.warn('Failed to update decorator mappings:', error)
    }
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidateFile(filePath: string): void {
    this.hotReloadManager.invalidateFile(filePath)
  }

  /**
   * Get hot-reload statistics
   */
  getHotReloadStats() {
    return this.hotReloadManager.getCacheStats()
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.hotReloadManager.disable()
  }

  /**
   * Initialize the transformer with plugin loading
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized)
      return

    try {
      await this.updateDecoratorMappings()
      this.isInitialized = true
    }
    catch (error) {
      console.warn('Transformer initialization failed:', error)
    }
  }

  /**
   * Set up hot-reload event handlers
   */
  private setupHotReload(): void {
    this.hotReloadManager.onHotReload(async (event: HotReloadEvent) => {
      switch (event.type) {
        case 'plugin-change':
        case 'config-change':
          // Reload plugins and update decorator mappings
          await this.updateDecoratorMappings()
          break

        case 'quascript-change':
          // File-specific invalidation is handled by the hot-reload manager
          break
      }
    })
  }

  /**
   * Extract dependencies from QuaScript source
   * This could include imported modules, plugin references, etc.
   */
  private extractDependencies(source: string): string[] {
    const dependencies: string[] = []

    // Extract import statements - simplified pattern
    const importRegex = /from\s+['"]([^'"]+)['"]/g

    let result = importRegex.exec(source)
    while (result !== null) {
      dependencies.push(result[1])
      result = importRegex.exec(source)
    }

    // Extract require statements
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g
    result = requireRegex.exec(source)
    while (result !== null) {
      dependencies.push(result[1])
      result = requireRegex.exec(source)
    }

    // Could also extract QuaScript-specific dependencies like:
    // - Character references
    // - Asset references
    // - Plugin decorator usage

    return dependencies
  }
}

/**
 * Plugin-aware QuaScript transformer with hot-reload (backward compatibility)
 */
export class PluginAwareQuaScriptTransformer extends HotReloadAwareTransformer {
  // Maintains backward compatibility while adding hot-reload features
}

/**
 * Create a hot-reload aware transformer instance
 */
export function createHotReloadAwareTransformer(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions & { projectRoot?: string },
): HotReloadAwareTransformer {
  return new HotReloadAwareTransformer(decoratorMappings, options)
}

/**
 * Create a plugin-aware transformer (with hot-reload support)
 */
export function createPluginAwareTransformer(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions & { projectRoot?: string },
): PluginAwareQuaScriptTransformer {
  return new PluginAwareQuaScriptTransformer(decoratorMappings, options)
}

/**
 * Create a plugin-aware transformer with synchronous plugin loading
 */
export async function createPluginAwareTransformerAsync(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions & { projectRoot?: string },
): Promise<HotReloadAwareTransformer> {
  const transformer = new HotReloadAwareTransformer(decoratorMappings, options)

  // Wait for initialization to complete
  await new Promise(resolve => setTimeout(resolve, 0))

  return transformer
}
