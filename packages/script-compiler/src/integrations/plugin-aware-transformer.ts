import type { CompilerOptions, DecoratorMapping } from '../core/types'
import { QuaScriptTransformer } from '../core/transformer'
import { mergeDecoratorMappings } from '../core/types'

/**
 * Plugin-aware QuaScript transformer that dynamically loads plugin decorators
 */
export class PluginAwareQuaScriptTransformer extends QuaScriptTransformer {
  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: CompilerOptions,
  ) {
    // Try to get plugin decorators if the registry is available
    let pluginDecorators: DecoratorMapping = {}

    try {
      // Dynamic import to avoid circular dependencies
      import('@quajs/engine').then((engineModule) => {
        const registry = engineModule.getPluginRegistry?.()
        if (registry?.getExtendedDecoratorMappings) {
          pluginDecorators = registry.getExtendedDecoratorMappings()
        }
      }).catch(() => {
        // Plugin registry not available, continue with default mappings
      })
    }
    catch {
      // Plugin registry not available, continue with default mappings
    }

    // Merge all decorator mappings: default + plugin + user-provided
    const finalMappings = mergeDecoratorMappings({
      ...pluginDecorators,
      ...decoratorMappings,
    })

    super(finalMappings, options)
  }

  /**
   * Transform source with plugin decorator support
   * Dynamically updates decorator mappings before transformation
   */
  transformSource(source: string): string {
    // Update decorator mappings with latest plugin registrations
    try {
      import('@quajs/engine').then((engineModule) => {
        const registry = engineModule.getPluginRegistry?.()
        if (registry?.getExtendedDecoratorMappings) {
          const pluginDecorators = registry.getExtendedDecoratorMappings()

          // Merge with existing mappings
          const updatedMappings = mergeDecoratorMappings({
            ...pluginDecorators,
            ...this.decoratorMappings,
          })

          // Update internal mappings
          this.decoratorMappings = updatedMappings
        }
      }).catch(() => {
        // Continue with existing mappings
      })
    }
    catch {
      // Continue with existing mappings
    }

    return super.transformSource(source)
  }
}

/**
 * Create a plugin-aware transformer instance
 */
export function createPluginAwareTransformer(
  decoratorMappings?: DecoratorMapping,
  options?: CompilerOptions,
): PluginAwareQuaScriptTransformer {
  return new PluginAwareQuaScriptTransformer(decoratorMappings, options)
}
