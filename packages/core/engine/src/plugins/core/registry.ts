// Import DecoratorMapping type locally to avoid circular dependency
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
  }
}

/**
 * Global API function registry for type-safe plugin extensions
 */
export interface PluginAPIFunction {
  name: string
  fn: (...args: any[]) => any
  module: string
}

/**
 * Plugin API registration configuration
 */
export interface PluginAPIRegistration {
  /** Plugin name for namespacing */
  pluginName: string
  /** Global APIs to register */
  apis: PluginAPIFunction[]
  /** QuaScript decorators to register */
  decorators: Record<string, {
    function: string
    module: string
  }>
}

/**
 * Registry for managing plugin-extended APIs
 */
export class PluginAPIRegistry {
  private static instance: PluginAPIRegistry | null = null
  private registeredAPIs = new Map<string, PluginAPIFunction>()
  private registeredDecorators = new Map<string, DecoratorMapping[string]>()
  private decoratorOwners = new Map<string, string>()
  private pluginModules = new Map<string, Record<string, any>>()

  static getInstance(): PluginAPIRegistry {
    if (!this.instance) {
      this.instance = new PluginAPIRegistry()
    }
    return this.instance
  }

  /**
   * Register APIs and decorators from a plugin
   */
  registerPlugin(registration: PluginAPIRegistration): void {
    const { pluginName, apis, decorators } = registration

    for (const decoratorName of Object.keys(decorators)) {
      const existing = this.registeredDecorators.get(decoratorName)
      const owner = this.decoratorOwners.get(decoratorName)
      const ownedBySamePlugin = owner === pluginName
        || (!owner && existing && isDecoratorOwnedByPlugin(existing, pluginName))
      if (existing && !ownedBySamePlugin) {
        throw new Error(`Decorator '${decoratorName}' is already registered`)
      }
    }

    this.unregisterPlugin(pluginName)

    // Create plugin module object
    const pluginModule: Record<string, any> = {}

    // Register each API function
    for (const api of apis) {
      const fullName = `${pluginName}.${api.name}`

      this.registeredAPIs.set(fullName, api)
      pluginModule[api.name] = api.fn
    }

    // Store plugin module
    this.pluginModules.set(pluginName, pluginModule)

    // Register decorators
    for (const [decoratorName, mapping] of Object.entries(decorators)) {
      this.registeredDecorators.set(decoratorName, mapping)
      this.decoratorOwners.set(decoratorName, pluginName)
    }
  }

  /**
   * Unregister a plugin's APIs and decorators
   */
  unregisterPlugin(pluginName: string): void {
    // Remove APIs
    for (const [key] of this.registeredAPIs.entries()) {
      if (key.startsWith(`${pluginName}.`)) {
        this.registeredAPIs.delete(key)
      }
    }

    // Remove decorators that belong to this plugin
    for (const [decoratorName, mapping] of this.registeredDecorators.entries()) {
      const owner = this.decoratorOwners.get(decoratorName)
      if (owner === pluginName || (!owner && isDecoratorOwnedByPlugin(mapping, pluginName))) {
        this.registeredDecorators.delete(decoratorName)
        this.decoratorOwners.delete(decoratorName)
      }
    }

    // Remove plugin module
    this.pluginModules.delete(pluginName)
  }

  /**
   * Get all registered API functions
   */
  getRegisteredAPIs(): Map<string, PluginAPIFunction> {
    return new Map(this.registeredAPIs)
  }

  /**
   * Get extended decorator mappings for QuaScript compiler
   */
  getExtendedDecoratorMappings(): DecoratorMapping {
    const extended: DecoratorMapping = {}

    for (const [decoratorName, mapping] of this.registeredDecorators.entries()) {
      extended[decoratorName] = mapping
    }

    return extended
  }

  /**
   * Get plugin module by name
   */
  getPluginModule(pluginName: string): Record<string, any> | undefined {
    return this.pluginModules.get(pluginName)
  }

  /**
   * Check if an API is registered
   */
  hasAPI(pluginName: string, apiName: string): boolean {
    return this.registeredAPIs.has(`${pluginName}.${apiName}`)
  }

  /**
   * Check if a decorator is registered
   */
  hasDecorator(decoratorName: string): boolean {
    return this.registeredDecorators.has(decoratorName)
  }

  /**
   * Get all registered decorators for compiler integration
   */
  getAllDecorators(): string[] {
    return Array.from(this.registeredDecorators.keys())
  }

  /**
   * Clear all registered plugin APIs and decorators.
   */
  clear(): void {
    this.registeredAPIs.clear()
    this.registeredDecorators.clear()
    this.decoratorOwners.clear()
    this.pluginModules.clear()
  }
}

function isDecoratorOwnedByPlugin(mapping: DecoratorMapping[string], pluginName: string): boolean {
  return mapping.module === pluginName || mapping.module.startsWith(`${pluginName}/`)
}

/**
 * Convenience function to get the registry instance
 */
export const getPluginRegistry = (): PluginAPIRegistry => PluginAPIRegistry.getInstance()
