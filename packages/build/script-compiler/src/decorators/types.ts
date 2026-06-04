import type * as t from '@babel/types'
import type { DecoratorMapping, QuaScriptDecorator } from '../core/types'

export interface DecoratorCompileContext {
  characterName?: string
  characterRef?: t.Expression
  speakOptions?: t.ObjectProperty[]
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
  characterName?: string
  characterRef?: t.Expression
  nextIndex?: number
  runtimeHelpers?: string[]
  skip?: boolean
  speakOptions?: t.ObjectProperty[]
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
  readonly scriptCompiler?: {
    readonly compilers?: readonly DecoratorCompiler[]
  }
}
