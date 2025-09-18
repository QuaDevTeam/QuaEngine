import type { CompilerOptions, DecoratorMapping } from '../core/types'
import { QuaScriptTransformer } from '../core/transformer'
import { mergeDecoratorMappings } from '../core/types'

/**
 * Get plugin decorators using the new discovery system
 */
async function getPluginDecorators(projectRoot?: string): Promise<DecoratorMapping> {
  try {
    // Import the plugin discovery system
    const { getDiscoveredDecoratorMappings } = await import('@quajs/engine/plugins/core/plugin-discovery')
    return await getDiscoveredDecoratorMappings(projectRoot)
  }
  catch {
    // Plugin discovery not available or failed
    return {}
  }
}

/**
 * Plugin-aware QuaScript transformer that uses package-based plugin discovery
 *
 * This transformer automatically discovers plugins from:
 * 1. Package.json dependencies (packages named @quajs/plugin-* or quajs-plugin-*)
 * 2. Custom plugin registry (qua.plugins.json)
 */
export class PluginAwareQuaScriptTransformer extends QuaScriptTransformer {
  private projectRoot?: string

  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: CompilerOptions & { projectRoot?: string },
  ) {
    // Start with user-provided mappings, plugins will be loaded async
    super(decoratorMappings || {}, options)

    // Store project root for plugin discovery
    this.projectRoot = options?.projectRoot

    // Load plugins asynchronously and update mappings
    this.loadPlugins()
  }

  /**
   * Load plugins asynchronously and update decorator mappings
   */
  private async loadPlugins(): Promise<void> {
    try {
      const pluginDecorators = await getPluginDecorators(this.projectRoot)

      // Merge with existing mappings
      const updatedMappings = mergeDecoratorMappings({
        ...pluginDecorators,
        ...this.decoratorMappings,
      })

      // Update internal mappings
      this.decoratorMappings = updatedMappings
    }
    catch {
      // Plugin loading failed, continue with existing mappings
    }
  }

  /**
   * Transform source with plugin decorator support
   */
  transformSource(source: string): string {
    return super.transformSource(source)
  }
}

/**
 * Create a plugin-aware transformer instance
 */
export function createPluginAwareTransformer(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions & { projectRoot?: string },
): PluginAwareQuaScriptTransformer {
  return new PluginAwareQuaScriptTransformer(decoratorMappings, options)
}

/**
 * Create a plugin-aware transformer with synchronous plugin loading
 * This is useful for build-time usage where async is not suitable
 */
export async function createPluginAwareTransformerAsync(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions & { projectRoot?: string },
): Promise<QuaScriptTransformer> {
  // Load plugins first
  const pluginDecorators = await getPluginDecorators(options?.projectRoot)

  // Merge with user mappings
  const finalMappings = mergeDecoratorMappings({
    ...pluginDecorators,
    ...decoratorMappings,
  })

  // Create transformer with final mappings
  return new QuaScriptTransformer(finalMappings, options)
}
