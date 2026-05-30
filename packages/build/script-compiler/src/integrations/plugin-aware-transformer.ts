import type { QuaScriptTransformerOptions } from '../core/transformer'
import type { DecoratorMapping } from '../core/types'
import { QuaScriptTransformer } from '../core/transformer'
import {
  loadProjectDecoratorCompilers,
  loadProjectDecoratorMappings,
  loadProjectDecoratorMappingsSync,
} from '../decorators'

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
  constructor(
    decoratorMappings?: DecoratorMapping,
    options?: QuaScriptTransformerOptions & { projectRoot?: string },
  ) {
    const discoveredMappings = loadProjectDecoratorMappingsSync(options?.projectRoot)
    super(decoratorMappings || {}, {
      ...options,
      availableDecoratorMappings: discoveredMappings,
      decoratorCompilers: [
        ...(options?.decoratorCompilers || []),
      ],
    })
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
  const pluginCompilers = await loadProjectDecoratorCompilers(options?.projectRoot)

  return new QuaScriptTransformer(decoratorMappings || {}, {
    ...options,
    availableDecoratorMappings: pluginDecorators,
    decoratorCompilers: [
      ...pluginCompilers,
      ...(options?.decoratorCompilers || []),
    ],
  })
}
