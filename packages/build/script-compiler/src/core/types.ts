/**
 * QuaScript AST node types
 */

import type * as t from '@babel/types'
import { flowControlDecoratorMappings, rollbackDecoratorMappings } from '@quajs/engine/script-compiler'

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

export type QuaScriptDiagnosticSeverity = 'error' | 'warning' | 'info'

export type QuaScriptDiagnosticSource
  = 'quascript/parser'
    | 'quascript/compiler'
    | 'quascript/typescript'
    | 'quascript/story'
    | 'quascript/project'
    | 'quascript/style'

export interface QuaScriptTextEdit {
  newText: string
  range: SourceRange
}

export interface QuaScriptFix {
  edits: QuaScriptTextEdit[]
  title: string
}

export interface QuaScriptDiagnostic {
  code: string
  fix?: QuaScriptFix
  message: string
  range?: SourceRange
  severity: QuaScriptDiagnosticSeverity
  source: QuaScriptDiagnosticSource
}

export type QuaScriptRuleSeverity = QuaScriptDiagnosticSeverity | 'off'

export interface QuaScriptLintRule {
  code: string
  defaultSeverity: QuaScriptRuleSeverity
  description: string
}

export interface QuaScriptLintOptions {
  rules?: Record<string, QuaScriptRuleSeverity>
}

export interface QuaScriptLintResult {
  diagnostics: QuaScriptDiagnostic[]
  errorCount: number
  fixableCount: number
  infoCount: number
  warningCount: number
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

export interface QuaScriptFormatOptions {
  insertFinalNewline?: boolean
  maxBlankLines?: number
}

export interface QuaScriptFormatResult {
  formatted: string
  changed: boolean
  edits: QuaScriptTextEdit[]
}

export interface QuaScriptToolingConfig {
  decorators?: {
    autoCollect?: boolean
    mappings?: DecoratorMapping
  }
  files?: {
    exclude?: string[]
    include?: string[]
  }
  format?: QuaScriptFormatOptions & {
    enable?: boolean
  }
  lint?: QuaScriptLintOptions & {
    enable?: boolean
  }
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
  argsRange?: SourceRange
  range?: SourceRange
}

export interface QuaScriptDialogue {
  type: 'dialogue'
  character?: string
  text: string
  mode?: 'say' | 'narration'
  textRange: SourceRange
  decorators: QuaScriptDecorator[]
  templateExpressions: string[]
  templateExpressionRanges: SourceRange[]
  range?: SourceRange
}

export interface QuaScriptChoiceDefinition {
  id?: string
  text: string
  textRange: SourceRange
  target?: QuaScriptDecoratorValue
  options?: QuaScriptDecoratorValue
  condition?: string
  conditionRange?: SourceRange
  templateExpressions: string[]
  templateExpressionRanges: SourceRange[]
  range?: SourceRange
  source: 'decorator' | 'sugar'
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
  options: QuaScriptChoiceDefinition[]
  range?: SourceRange
}

export interface ParsedQuaScript {
  steps: QuaScriptStep[]
  imports: Set<string>
  characters: Set<string>
  diagnostics: QuaScriptDiagnostic[]
}

export interface StoryDeclaration {
  moduleId?: string
  runtimePackageId?: string
  scenes: Array<{ id: string, metadata?: Record<string, unknown> }>
  entries?: Array<{ id: string, point: Record<string, unknown>, metadata?: Record<string, unknown> }>
  nodes: Array<{ id: string, point: Record<string, unknown>, title?: string, summary?: string, presentation?: Record<string, unknown>, chapterSelect?: Record<string, unknown>, metadata?: Record<string, unknown> }>
  labels: Array<{ id: string, point: Record<string, unknown>, metadata?: Record<string, unknown> }>
  choices: Array<{ id: string, text: string, target?: Record<string, unknown>, condition?: string, source: 'decorator' | 'sugar', point: Record<string, unknown> }>
  edges: Array<{ id: string, from: string, to: string, kind: 'choice' | string, condition?: string, metadata?: Record<string, unknown> }>
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
  QuickSave: {
    function: 'quickSave',
    module: '@quajs/engine',
  },
  QuickLoad: {
    function: 'quickLoad',
    module: '@quajs/engine',
  },
  AutoSave: {
    function: 'autoSave',
    module: '@quajs/engine',
  },
  Choice: {
    function: 'defineChoice',
    module: '@quajs/engine',
  },
  ...flowControlDecoratorMappings,
  ...rollbackDecoratorMappings,
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
