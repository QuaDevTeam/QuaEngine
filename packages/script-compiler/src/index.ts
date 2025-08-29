import { createPluginAwareTransformer } from './integrations/plugin-aware-transformer'
import { QuaScriptTransformer } from './core/transformer'
import type { CompilerOptions, DecoratorMapping } from './core/types'

export { QuaScriptParser } from './core/parser'
export { QuaScriptTransformer } from './core/transformer'
export { PluginAwareQuaScriptTransformer, createPluginAwareTransformer } from './integrations/plugin-aware-transformer'
export { quaScriptPlugin } from './integrations/vite-plugin'
export type {
  QuaScriptDecorator,
  QuaScriptDialogue,
  QuaScriptStep,
  QuaScriptAction,
  QuaScriptChoice,
  ParsedQuaScript,
  CompilerOptions,
  DecoratorMapping
} from './core/types'
export { DEFAULT_DECORATOR_MAPPINGS, mergeDecoratorMappings } from './core/types'

/**
 * Convenience function to compile QuaScript string
 */
export function compileQuaScript(
  source: string,
  options?: {
    decoratorMappings?: DecoratorMapping
    compilerOptions?: CompilerOptions
    usePluginDecorators?: boolean
  }
): string {
  if (options?.usePluginDecorators !== false) {
    const transformer = createPluginAwareTransformer(
      options?.decoratorMappings,
      options?.compilerOptions
    )
    return transformer.transformSource(source)
  } else {
    const transformer = new QuaScriptTransformer(
      options?.decoratorMappings,
      options?.compilerOptions
    )
    return transformer.transformSource(source)
  }
}
