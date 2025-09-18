import type { CompilerOptions, DecoratorMapping } from './core/types'
import process from 'node:process'
import { createHotReloadAwareTransformer } from './integrations/hot-reload-transformer'
import { createPluginAwareTransformer } from './integrations/plugin-aware-transformer'

// Hot-reload manager
export {
  getHotReloadManager,
  HotReloadManager,
  resetHotReloadManager,
} from './core/hot-reload'
export type { HotReloadCallback, HotReloadEvent } from './core/hot-reload'

export { QuaScriptParser } from './core/parser'
export { QuaScriptTransformer } from './core/transformer'

// Core types
export type {
  CompilerOptions,
  DecoratorMapping,
  ParsedQuaScript,
  QuaScriptAction,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDialogue,
  QuaScriptStep,
} from './core/types'

export { DEFAULT_DECORATOR_MAPPINGS, mergeDecoratorMappings } from './core/types'
// Hot-reload transformers
export {
  createHotReloadAwareTransformer,
  HotReloadAwareTransformer,
} from './integrations/hot-reload-transformer'

// Plugin-aware transformers
export { createPluginAwareTransformer, PluginAwareQuaScriptTransformer } from './integrations/plugin-aware-transformer'
export { createPluginAwareTransformerAsync } from './integrations/plugin-aware-transformer'

// Vite plugin with hot-reload support
export { quaScriptPlugin } from './integrations/vite-plugin'
export type { QuaScriptPluginOptions } from './integrations/vite-plugin'

/**
 * Convenience function to compile QuaScript string (with hot-reload support)
 */
export function compileQuaScript(
  source: string,
  options?: {
    decoratorMappings?: DecoratorMapping
    compilerOptions?: CompilerOptions
    /** Project root for plugin discovery */
    projectRoot?: string
    /** Enable hot-reload features */
    hotReload?: boolean
  },
): string {
  const { hotReload = process.env.NODE_ENV !== 'production', ...restOptions } = options || {}

  const transformer = hotReload
    ? createHotReloadAwareTransformer(
        restOptions.decoratorMappings,
        {
          ...restOptions.compilerOptions,
          projectRoot: restOptions.projectRoot,
        },
      )
    : createPluginAwareTransformer(
        restOptions.decoratorMappings,
        {
          ...restOptions.compilerOptions,
          projectRoot: restOptions.projectRoot,
        },
      )

  return transformer.transformSource(source)
}
