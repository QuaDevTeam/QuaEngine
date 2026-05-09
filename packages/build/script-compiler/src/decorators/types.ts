import type * as t from '@babel/types'
import type { DecoratorMapping, QuaScriptDecorator } from '../core/types'

export interface DecoratorCompileContext {
  characterName?: string
  stepType: 'dialogue' | 'action'
}

export interface DecoratorCompileInput {
  decorator: QuaScriptDecorator
  decorators: QuaScriptDecorator[]
  index: number
  context: DecoratorCompileContext
  mapping: DecoratorMapping[string]
}

export interface DecoratorCompilationResult {
  call: t.CallExpression
  nextIndex?: number
  runtimeHelpers?: string[]
}

export interface DecoratorCompiler {
  readonly module: string
  readonly runtimeHelperModules?: Record<string, string>
  supports: (decoratorName: string, mapping: DecoratorMapping[string]) => boolean
  compile: (input: DecoratorCompileInput) => DecoratorCompilationResult | null
}
