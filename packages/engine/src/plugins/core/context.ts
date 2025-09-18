import type { EnginePlugin, PluginContext } from './types'

/**
 * Implementation of plugin context for inter-plugin communication
 */
export class PluginContextImpl implements PluginContext {
  private plugins = new Map<string, EnginePlugin>()
  private pluginsById = new Map<string, EnginePlugin>()

  /**
   * Register a plugin in the context
   */
  registerPlugin(plugin: EnginePlugin): void {
    this.plugins.set(plugin.name, plugin)

    if (plugin.id) {
      this.pluginsById.set(plugin.id, plugin)
    }
  }

  /**
   * Unregister a plugin from the context
   */
  unregisterPlugin(plugin: EnginePlugin): void {
    this.plugins.delete(plugin.name)

    if (plugin.id) {
      this.pluginsById.delete(plugin.id)
    }
  }

  /**
   * Get a plugin instance by name
   */
  getPlugin<T extends EnginePlugin = EnginePlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined
  }

  /**
   * Get a plugin instance by ID
   */
  getPluginById<T extends EnginePlugin = EnginePlugin>(id: string): T | undefined {
    return this.pluginsById.get(id) as T | undefined
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): Map<string, EnginePlugin> {
    return new Map(this.plugins)
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  /**
   * Clear all plugins (used during engine destruction)
   */
  clear(): void {
    this.plugins.clear()
    this.pluginsById.clear()
  }
}
