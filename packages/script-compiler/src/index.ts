export { QuaScriptParser } from './parser'
export { QuaScriptTransformer } from './transformer'
export { quaScriptPlugin } from './vite-plugin'
export type {
  QuaScriptDecorator,
  QuaScriptDialogue,
  QuaScriptStep,
  QuaScriptAction,
  QuaScriptChoice,
  ParsedQuaScript,
  CompilerOptions,
  DecoratorMapping
} from './types'
export { DEFAULT_DECORATOR_MAPPINGS } from './types'

/**
 * Convenience function to compile QuaScript string
 */
export function compileQuaScript(
  source: string,
  options?: {
    decoratorMappings?: any
    compilerOptions?: any
  }
): string {
  const { QuaScriptTransformer } = require('./transformer')
  const transformer = new QuaScriptTransformer(
    options?.decoratorMappings,
    options?.compilerOptions
  )
  return transformer.transformSource(source)
}
