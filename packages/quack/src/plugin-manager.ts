import { createLogger } from '@quajs/logger'
import type { QuackPlugin, AssetContext, QuackConfig, BundleManifest } from './types.js'

const logger = createLogger('quack:plugin-manager')

export class PluginManager {
  private plugins: QuackPlugin[] = []
  private initialized = false

  /**
   * Register a plugin
   */
  register(plugin: QuackPlugin): void {
    logger.info(`Registering plugin: ${plugin.name}@${plugin.version}`)
    this.plugins.push(plugin)
  }

  /**
   * Register multiple plugins
   */
  registerMany(plugins: QuackPlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin)
    }
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): QuackPlugin[] {
    return [...this.plugins]
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): QuackPlugin | undefined {
    return this.plugins.find(p => p.name === name)
  }

  /**
   * Initialize all plugins
   */
  async initialize(config: QuackConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('Plugin manager already initialized')
      return
    }

    logger.info(`Initializing ${this.plugins.length} plugins`)

    for (const plugin of this.plugins) {
      try {
        if (plugin.initialize) {
          await plugin.initialize(config)
          logger.debug(`Plugin initialized: ${plugin.name}`)
        }
      } catch (error) {
        logger.error(`Failed to initialize plugin: ${plugin.name}`, error)
        throw new Error(`Plugin initialization failed: ${plugin.name}`)
      }
    }

    this.initialized = true
    logger.info('All plugins initialized successfully')
  }

  /**
   * Process asset through all plugins
   */
  async processAsset(context: AssetContext): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        if (plugin.processAsset) {
          await plugin.processAsset(context)
          logger.debug(`Asset processed by plugin: ${plugin.name} -> ${context.asset.relativePath}`)
        }
      } catch (error) {
        logger.error(`Plugin failed to process asset: ${plugin.name} -> ${context.asset.relativePath}`, error)
        throw new Error(`Asset processing failed: ${plugin.name}`)
      }
    }
  }

  /**
   * Call post-bundle hooks
   */
  async postBundle(bundlePath: string, manifest: BundleManifest): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        if (plugin.postBundle) {
          await plugin.postBundle(bundlePath, manifest)
          logger.debug(`Post-bundle hook called: ${plugin.name}`)
        }
      } catch (error) {
        logger.error(`Plugin post-bundle hook failed: ${plugin.name}`, error)
        // Don't throw here, just log the error
      }
    }
  }

  /**
   * Cleanup all plugins
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    logger.info('Cleaning up plugins')

    for (const plugin of this.plugins) {
      try {
        if (plugin.cleanup) {
          await plugin.cleanup()
          logger.debug(`Plugin cleaned up: ${plugin.name}`)
        }
      } catch (error) {
        logger.error(`Plugin cleanup failed: ${plugin.name}`, error)
        // Continue cleaning up other plugins
      }
    }

    this.initialized = false
    logger.info('Plugin cleanup completed')
  }

  /**
   * Remove all plugins
   */
  clear(): void {
    this.plugins = []
    this.initialized = false
    logger.info('All plugins cleared')
  }

  /**
   * Remove plugin by name
   */
  remove(name: string): boolean {
    const index = this.plugins.findIndex(p => p.name === name)
    if (index >= 0) {
      const plugin = this.plugins.splice(index, 1)[0]
      logger.info(`Plugin removed: ${plugin.name}`)
      return true
    }
    return false
  }

  /**
   * Check if plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.some(p => p.name === name)
  }

  /**
   * Get plugin information
   */
  getInfo(): Array<{ name: string; version: string }> {
    return this.plugins.map(p => ({
      name: p.name,
      version: p.version
    }))
  }
}