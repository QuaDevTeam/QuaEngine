import type {
  CustomPluginRegistry,
  CustomPluginSpec,
  DiscoveredPlugin,
  PluginPackageExports,
  PluginPackageSpec,
} from './plugin-spec'
import type { DecoratorMapping } from './registry'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

/**
 * Plugin discovery service that scans packages and custom registries
 */
export class PluginDiscovery {
  private projectRoot: string
  private packageJson: any
  private customRegistry?: CustomPluginRegistry

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot
    this.packageJson = this.loadPackageJson()
    this.customRegistry = this.loadCustomRegistry()
  }

  /**
   * Discover all available plugins
   */
  async discoverPlugins(): Promise<DiscoveredPlugin[]> {
    const plugins: DiscoveredPlugin[] = []

    // Discover package-based plugins
    const packagePlugins = await this.discoverPackagePlugins()
    plugins.push(...packagePlugins)

    // Discover custom plugins
    const customPlugins = await this.discoverCustomPlugins()
    plugins.push(...customPlugins)

    return plugins
  }

  /**
   * Get decorator mappings from all discovered plugins
   */
  async getDecoratorMappings(): Promise<DecoratorMapping> {
    const plugins = await this.discoverPlugins()
    const mappings: DecoratorMapping = {}

    for (const plugin of plugins) {
      if (plugin.enabled) {
        Object.assign(mappings, plugin.decorators)
      }
    }

    return mappings
  }

  /**
   * Discover plugins from package.json dependencies
   */
  private async discoverPackagePlugins(): Promise<DiscoveredPlugin[]> {
    if (!this.packageJson) {
      return []
    }

    const plugins: DiscoveredPlugin[] = []
    const dependencies = {
      ...this.packageJson.dependencies,
      ...this.packageJson.devDependencies,
    }

    for (const [packageName, version] of Object.entries(dependencies)) {
      if (this.isPluginPackage(packageName)) {
        try {
          const plugin = await this.loadPackagePlugin(packageName, version as string)
          if (plugin) {
            plugins.push(plugin)
          }
        }
        catch (error) {
          console.warn(`Failed to load plugin package ${packageName}:`, error)
        }
      }
    }

    return plugins
  }

  /**
   * Discover plugins from custom registry
   */
  private async discoverCustomPlugins(): Promise<DiscoveredPlugin[]> {
    if (!this.customRegistry) {
      return []
    }

    const plugins: DiscoveredPlugin[] = []

    for (const customSpec of this.customRegistry.plugins) {
      if (customSpec.enabled !== false) {
        try {
          const plugin = await this.loadCustomPlugin(customSpec)
          if (plugin) {
            plugins.push(plugin)
          }
        }
        catch (error) {
          console.warn(`Failed to load custom plugin ${customSpec.name}:`, error)
        }
      }
    }

    return plugins
  }

  /**
   * Check if a package name follows plugin naming convention
   */
  private isPluginPackage(packageName: string): boolean {
    return (
      packageName.startsWith('@quajs/plugin-')
      || packageName.startsWith('quajs-plugin-')
      // Also check if package has quajs.type: 'plugin' in package.json
      || this.hasPluginMetadata(packageName)
    )
  }

  /**
   * Check if a package has plugin metadata in its package.json
   */
  private hasPluginMetadata(packageName: string): boolean {
    try {
      const packagePath = require.resolve(`${packageName}/package.json`)
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
      return packageJson.quajs?.type === 'plugin'
    }
    catch {
      return false
    }
  }

  /**
   * Load a plugin from a package
   */
  private async loadPackagePlugin(packageName: string, _version: string): Promise<DiscoveredPlugin | null> {
    try {
      // Load package.json to get plugin metadata
      const packagePath = require.resolve(`${packageName}/package.json`)
      const packageJson: PluginPackageSpec = JSON.parse(readFileSync(packagePath, 'utf8'))

      if (!packageJson.quajs || packageJson.quajs.type !== 'plugin') {
        return null
      }

      // Load plugin module
      const pluginModule: PluginPackageExports = await import(packageName)

      return {
        source: 'package',
        name: packageJson.name,
        version: packageJson.version,
        entry: packageName,
        metadata: {
          description: packageJson.quajs.description || packageJson.description,
          category: packageJson.quajs.category,
          author: typeof packageJson.author === 'string'
            ? packageJson.author
            : packageJson.author?.name,
        },
        decorators: pluginModule.decorators || {},
        apis: Object.keys(pluginModule.apis || {}),
        enabled: true,
      }
    }
    catch (error) {
      console.warn(`Failed to load plugin package ${packageName}:`, error)
      return null
    }
  }

  /**
   * Load a custom plugin
   */
  private async loadCustomPlugin(customSpec: CustomPluginSpec): Promise<DiscoveredPlugin | null> {
    try {
      const entryPath = resolve(this.projectRoot, customSpec.entry)
      const pluginModule: PluginPackageExports = await import(entryPath)

      return {
        source: 'custom',
        name: customSpec.name,
        version: customSpec.version || '1.0.0',
        entry: entryPath,
        metadata: {
          description: customSpec.description,
          category: customSpec.category,
        },
        decorators: pluginModule.decorators || {},
        apis: Object.keys(pluginModule.apis || {}),
        enabled: customSpec.enabled !== false,
      }
    }
    catch (error) {
      console.warn(`Failed to load custom plugin ${customSpec.name}:`, error)
      return null
    }
  }

  /**
   * Load project package.json
   */
  private loadPackageJson(): any {
    try {
      const packagePath = join(this.projectRoot, 'package.json')
      if (existsSync(packagePath)) {
        return JSON.parse(readFileSync(packagePath, 'utf8'))
      }
    }
    catch (error) {
      console.warn('Failed to load package.json:', error)
    }
    return null
  }

  /**
   * Load custom plugin registry
   */
  private loadCustomRegistry(): CustomPluginRegistry | undefined {
    try {
      const registryPath = join(this.projectRoot, 'qua.plugins.json')
      if (existsSync(registryPath)) {
        return JSON.parse(readFileSync(registryPath, 'utf8'))
      }
    }
    catch (error) {
      console.warn('Failed to load qua.plugins.json:', error)
    }
    return undefined
  }
}

/**
 * Singleton instance for plugin discovery
 */
let discoveryInstance: PluginDiscovery | null = null

/**
 * Get or create plugin discovery instance
 */
export function getPluginDiscovery(projectRoot?: string): PluginDiscovery {
  if (!discoveryInstance || projectRoot) {
    discoveryInstance = new PluginDiscovery(projectRoot)
  }
  return discoveryInstance
}

/**
 * Get decorator mappings from discovered plugins
 * This is the main function used by script-compiler
 */
export async function getDiscoveredDecoratorMappings(projectRoot?: string): Promise<DecoratorMapping> {
  const discovery = getPluginDiscovery(projectRoot)
  return await discovery.getDecoratorMappings()
}
