import type { QuaScriptTransformerOptions } from '../core/transformer'
import type { DecoratorMapping } from '../core/types'
import { QuaScriptTransformer } from '../core/transformer'
import { loadPackageDecoratorMappingsSync, loadProjectDecoratorMappings } from '../decorators'

/**
 * Get project decorators using package metadata and engine discovery.
 */
async function getPluginDecorators(projectRoot?: string): Promise<DecoratorMapping> {
  return loadProjectDecoratorMappings(projectRoot)
}

/**
 * Plugin-aware QuaScript transformer that uses package-based plugin discovery
 *
 * This transformer automatically discovers plugins from:
 * 1. Package.json dependency fields with explicit quajs metadata
 * 2. Custom plugin registry (qua.plugins.json)
 */
export class PluginAwareQuaScriptTransformer extends QuaScriptTransformer {
  private projectRoot?: string

  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: QuaScriptTransformerOptions & { projectRoot?: string },
  ) {
    const discoveredMappings = loadPackageDecoratorMappingsSync(options?.projectRoot)
    super(decoratorMappings || {}, {
      ...options,
      availableDecoratorMappings: discoveredMappings,
    })

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
      this.setAvailableDecoratorMappings(pluginDecorators)
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
  options?: QuaScriptTransformerOptions & { projectRoot?: string },
): PluginAwareQuaScriptTransformer {
  return new PluginAwareQuaScriptTransformer(decoratorMappings, options)
}

/**
 * Create a plugin-aware transformer with synchronous plugin loading
 * This is useful for build-time usage where async is not suitable
 */
export async function createPluginAwareTransformerAsync(
  decoratorMappings?: DecoratorMapping,
  options?: QuaScriptTransformerOptions & { projectRoot?: string },
): Promise<QuaScriptTransformer> {
  const pluginDecorators = await getPluginDecorators(options?.projectRoot)

  return new QuaScriptTransformer(decoratorMappings || {}, {
    ...options,
    availableDecoratorMappings: pluginDecorators,
  })
}
