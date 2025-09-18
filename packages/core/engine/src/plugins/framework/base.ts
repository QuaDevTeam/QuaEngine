import type { PluginAPIRegistration } from '../core/registry'
import type { EngineContext, EnginePlugin, PluginConstructorOptions } from '../core/types'
import { BaseEnginePlugin } from '../core/types'

/**
 * Plugin development utilities - clean and minimal
 */

/**
 * Helper function to define API functions with auto-inferred types
 */
export function defineAPIFunction<T extends (...args: any[]) => any>(
  name: string,
  implementation: T,
  options?: {
    module?: string
  },
): {
  name: string
  fn: T
  module: string
} {
  return {
    name,
    fn: implementation,
    module: options?.module || 'plugin',
  }
}

/**
 * Helper function to create QuaScript decorator definitions
 */
export function defineDecorator(
  name: string,
  config: {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  },
) {
  return { [name]: config }
}

/**
 * Minimal plugin framework - developers have full control over state and communication
 */
export abstract class PluginFramework extends BaseEnginePlugin {
  protected apiRegistration?: PluginAPIRegistration

  constructor(options: PluginConstructorOptions = {}) {
    super(options)
  }

  /**
   * Helper method to define plugin APIs in a structured way
   */
  protected definePluginAPIs(): PluginAPIRegistration {
    const apis = this.getPluginAPIs?.() || []
    const decorators = this.getPluginDecorators?.() || {}

    return {
      pluginName: this.name,
      apis,
      decorators,
    }
  }

  /**
   * Override this method to define plugin APIs
   */
  protected abstract getPluginAPIs?(): ReturnType<typeof defineAPIFunction>[]

  /**
   * Override this method to define QuaScript decorators
   */
  protected abstract getPluginDecorators?(): Record<string, {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  }>

  /**
   * Default implementation of registerAPIs using the defined structure
   */
  registerAPIs(): PluginAPIRegistration {
    if (!this.apiRegistration) {
      this.apiRegistration = this.definePluginAPIs()
    }
    return this.apiRegistration
  }

  /**
   * Helper to create context-aware API functions with auto-inferred types
   * The function signature is automatically inferred from the implementation
   */
  protected createContextAPI<T extends (...args: any[]) => any>(
    name: string,
    implementation: (ctx: EngineContext, ...args: Parameters<T>) => ReturnType<T>,
    options?: {
      module?: string
    },
  ): {
    name: string
    fn: T
    module: string
  } {
    const contextBoundFn = (...args: Parameters<T>) => {
      const ctx = this.getContext()
      return implementation(ctx, ...args)
    }

    return defineAPIFunction(name, contextBoundFn as T, {
      module: options?.module || this.name,
    })
  }

  /**
   * Get the engine context (throws if not initialized)
   */
  protected getContext(): EngineContext {
    if (!this.ctx) {
      throw new Error(`Plugin ${this.name} not initialized`)
    }
    return this.ctx
  }

  /**
   * Get another plugin instance by name
   */
  protected getPlugin<T extends EnginePlugin = EnginePlugin>(name: string): T | undefined {
    return this.getContext().plugins.getPlugin<T>(name)
  }

  /**
   * Get another plugin instance by ID
   */
  protected getPluginById<T extends EnginePlugin = EnginePlugin>(id: string): T | undefined {
    return this.getContext().plugins.getPluginById<T>(id)
  }

  /**
   * Check if a plugin is registered
   */
  protected hasPlugin(name: string): boolean {
    return this.getContext().plugins.hasPlugin(name)
  }

  /**
   * Get all registered plugins
   */
  protected getAllPlugins(): Map<string, EnginePlugin> {
    return this.getContext().plugins.getAllPlugins()
  }

  // Developers manage their own state and communication patterns
  // No predefined helpers - maximum freedom
}
