/**
 * QuaScript AST node types
 */

import type * as t from '@babel/types'
import { characterDecoratorMappings } from '@quajs/character/script-compiler'

export type QuaScriptDecoratorValue
  = string
    | number
    | boolean
    | null
    | t.Expression
    | QuaScriptDecoratorValue[]
    | { [key: string]: QuaScriptDecoratorValue }

export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface SourceRange {
  start: SourcePosition
  end: SourcePosition
}

export interface QuaScriptDiagnostic {
  message: string
  range?: SourceRange
  severity: 'error' | 'warning'
}

export interface QuaScriptDocumentBlock {
  content: string
  attrs: Record<string, string | boolean>
  range: SourceRange
  contentRange: SourceRange
  setup: boolean
}

export interface ParsedQuaScriptDocument {
  source: string
  moduleScript?: QuaScriptDocumentBlock
  setupScript?: QuaScriptDocumentBlock
  dslBody: string
  diagnostics: QuaScriptDiagnostic[]
}

export interface QuaScriptDecorator {
  name: string
  args: QuaScriptDecoratorValue[]
  range?: SourceRange
}

export interface QuaScriptDialogue {
  type: 'dialogue'
  character: string
  text: string
  decorators: QuaScriptDecorator[]
  templateExpressions: string[]
  range?: SourceRange
}

export interface QuaScriptStep {
  uuid: string
  type: 'dialogue' | 'action' | 'choice'
  content: QuaScriptDialogue | QuaScriptAction | QuaScriptChoice
  range?: SourceRange
}

export interface QuaScriptAction {
  type: 'action'
  decorators: QuaScriptDecorator[]
  range?: SourceRange
}

export interface QuaScriptChoice {
  type: 'choice'
  options: Array<{
    id: string
    text: string
    target: string
    condition?: string
    range?: SourceRange
  }>
  range?: SourceRange
}

export interface ParsedQuaScript {
  steps: QuaScriptStep[]
  imports: Set<string>
  characters: Set<string>
  diagnostics: QuaScriptDiagnostic[]
}

/**
 * Decorator mapping configuration
 */
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
  }
}

export const DEFAULT_DECORATOR_MAPPINGS: DecoratorMapping = {
  SaveToSlot: {
    function: 'saveToSlot',
    module: '@quajs/engine',
  },
  LoadFromSlot: {
    function: 'loadFromSlot',
    module: '@quajs/engine',
  },
  ...characterDecoratorMappings,
}

/**
 * Merge plugin-extended decorator mappings with default mappings
 */
export function mergeDecoratorMappings(
  pluginMappings: DecoratorMapping = {},
): DecoratorMapping {
  return {
    ...DEFAULT_DECORATOR_MAPPINGS,
    ...pluginMappings,
  }
}
