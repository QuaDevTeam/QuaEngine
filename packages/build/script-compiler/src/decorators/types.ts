import type * as t from '@babel/types'
import type { DecoratorMapping, QuaScriptDecorator } from '../core/types'

export interface DecoratorCompileContext {
  characterName?: string
  stepType: 'dialogue' | 'action'
  stepIndex: number
  stepUuid: string
  state: Record<string, unknown>
}

export interface DecoratorCompileInput {
  decorator: QuaScriptDecorator
  decorators: QuaScriptDecorator[]
  index: number
  context: DecoratorCompileContext
  mapping: DecoratorMapping[string]
}

export interface DecoratorCompilationResult {
  call?: t.CallExpression
  nextIndex?: number
  runtimeHelpers?: string[]
  skip?: boolean
}

export interface ImplicitDecoratorCompileInput {
  decorators: QuaScriptDecorator[]
  context: DecoratorCompileContext
}

export interface DecoratorCompiler {
  readonly module: string
  readonly runtimeHelperModules?: Record<string, string>
  supports: (decoratorName: string, mapping: DecoratorMapping[string]) => boolean
  compile: (input: DecoratorCompileInput) => DecoratorCompilationResult | null
  compileImplicit?: (input: ImplicitDecoratorCompileInput) => DecoratorCompilationResult[] | null
}

export interface DecoratorCompilerContribution {
  readonly compilers?: readonly DecoratorCompiler[]
}
