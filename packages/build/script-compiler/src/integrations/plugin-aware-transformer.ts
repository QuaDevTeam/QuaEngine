import type { QuaScriptTransformerOptions } from '../core/transformer'
import type { DecoratorMapping } from '../core/types'
import { QuaScriptTransformer } from '../core/transformer'
import { mergeDecoratorMappings } from '../core/types'
import { clearDecoratorCompilerCache, loadDecoratorCompilerRegistry, loadPackageDecoratorMappingsSync, loadProjectDecoratorMappings } from '../decorators'

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
 * 1. Package.json dependency fields (packages named @quajs/plugin-* or quajs-plugin-*)
 * 2. Custom plugin registry (qua.plugins.json)
 */
export class PluginAwareQuaScriptTransformer extends QuaScriptTransformer {
  private projectRoot?: string
  private explicitMappings: DecoratorMapping

  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: QuaScriptTransformerOptions & { projectRoot?: string },
  ) {
    const packageMappings = loadPackageDecoratorMappingsSync(options?.projectRoot)
    const initialMappings = mergeDecoratorMappings({
      ...packageMappings,
      ...(decoratorMappings || {}),
    })

    super(initialMappings, options)

    // Store project root for plugin discovery
    this.projectRoot = options?.projectRoot
    this.explicitMappings = decoratorMappings || {}

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
        ...this.explicitMappings,
      })

      // Update internal mappings
      this.decoratorMappings = updatedMappings
      clearDecoratorCompilerCache()
      this.decoratorCompilerRegistry = await loadDecoratorCompilerRegistry(updatedMappings)
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

  const finalMappings = mergeDecoratorMappings({
    ...pluginDecorators,
    ...(decoratorMappings || {}),
  })
  clearDecoratorCompilerCache()
  const decoratorCompilerRegistry = await loadDecoratorCompilerRegistry(finalMappings)

  return new QuaScriptTransformer(finalMappings, {
    ...options,
    decoratorCompilerRegistry,
  })
}
