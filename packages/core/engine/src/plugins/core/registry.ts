// Import DecoratorMapping type locally to avoid circular dependency
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
  }
}

/**
 * API function metadata registry for plugin extensions.
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
  /** Developer-facing plugin instance APIs to register for tooling/discovery */
  apis: PluginAPIFunction[]
  /** QuaScript decorators to register */
  decorators: Record<string, {
    function: string
    module: string
  }>
}

/**
 * Registry for managing plugin API metadata and decorators.
 */
export class PluginAPIRegistry {
  private static instance: PluginAPIRegistry | null = null
  private registeredAPIs = new Map<string, PluginAPIFunction>()
  private registeredDecorators = new Map<string, DecoratorMapping[string]>()
  private decoratorOwners = new Map<string, string>()

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

    // Register each API function
    for (const api of apis) {
      const fullName = `${pluginName}.${api.name}`

      this.registeredAPIs.set(fullName, api)
    }

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
   * Clear all registered plugin API metadata and decorators.
   */
  clear(): void {
    this.registeredAPIs.clear()
    this.registeredDecorators.clear()
    this.decoratorOwners.clear()
  }
}

function isDecoratorOwnedByPlugin(mapping: DecoratorMapping[string], pluginName: string): boolean {
  return mapping.module === pluginName || mapping.module.startsWith(`${pluginName}/`)
}

/**
 * Convenience function to get the registry instance
 */
export const getPluginRegistry = (): PluginAPIRegistry => PluginAPIRegistry.getInstance()
