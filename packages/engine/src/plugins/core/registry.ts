// Import DecoratorMapping type locally to avoid circular dependency
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
    transform?: (args: any[]) => any[]
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
    transform?: (args: any[]) => any[]
  }>
}

/**
 * Registry for managing plugin-extended APIs
 */
export class PluginAPIRegistry {
  private static instance: PluginAPIRegistry | null = null
  private registeredAPIs = new Map<string, PluginAPIFunction>()
  private registeredDecorators = new Map<string, DecoratorMapping[string]>()
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

    // Create plugin module object
    const pluginModule: Record<string, any> = {}
    
    // Register each API function
    for (const api of apis) {
      const fullName = `${pluginName}.${api.name}`
      
      if (this.registeredAPIs.has(fullName)) {
        throw new Error(`API function '${fullName}' is already registered`)
      }
      
      this.registeredAPIs.set(fullName, api)
      pluginModule[api.name] = api.fn
    }

    // Store plugin module
    this.pluginModules.set(pluginName, pluginModule)

    // Register decorators
    for (const [decoratorName, mapping] of Object.entries(decorators)) {
      if (this.registeredDecorators.has(decoratorName)) {
        throw new Error(`Decorator '${decoratorName}' is already registered`)
      }
      this.registeredDecorators.set(decoratorName, mapping)
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
      if (mapping.module === pluginName || mapping.module.includes(pluginName)) {
        this.registeredDecorators.delete(decoratorName)
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
}

/**
 * Convenience function to get the registry instance
 */
export const getPluginRegistry = (): PluginAPIRegistry => PluginAPIRegistry.getInstance()