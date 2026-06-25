export type NativeUiDocumentKind = 'qui' | 'qss'

export type NativeUiDiagnosticSeverity = 'error' | 'warning' | 'info'

export interface NativeUiPosition {
  line: number
  character: number
}

export interface NativeUiRange {
  start: NativeUiPosition
  end: NativeUiPosition
}

export interface NativeUiDiagnostic {
  code: string
  message: string
  range?: NativeUiRange
  severity: NativeUiDiagnosticSeverity
  source: 'qui' | 'qss' | 'native-ui'
}

export type NativeUiCompletionKind
  = | 'asset'
    | 'component'
    | 'directive'
    | 'import'
    | 'keyword'
    | 'property'
    | 'selector'
    | 'slot'
    | 'value'

export interface NativeUiCompletionItem {
  detail?: string
  insertText?: string
  kind: NativeUiCompletionKind
  label: string
  sortText?: string
}

export interface NativeUiHover {
  contents: string
  range?: NativeUiRange
}

export interface NativeUiFormatOptions {
  indentSize?: number
  insertFinalNewline?: boolean
}

export interface NativeUiLintOptions {
  allowPreviewFeatures?: boolean
  maxSelectorDepth?: number
  strictComponents?: boolean
}

export interface NativeUiLanguageOptions {
  filePath?: string
  format?: NativeUiFormatOptions
  languageId?: string
  lint?: NativeUiLintOptions
}

export interface NativeQuiImport {
  kind: 'component' | 'style' | 'tokens'
  path: string
  pathRange: NativeUiRange
  range: NativeUiRange
}

export interface NativeQuiNode {
  classes: string[]
  name: string
  nameRange: NativeUiRange
  range: NativeUiRange
}

export interface NativeQuiProp {
  name: string
  nameRange: NativeUiRange
  range: NativeUiRange
  value?: string
  valueRange?: NativeUiRange
}

export interface NativeQuiDocument {
  diagnostics: NativeUiDiagnostic[]
  imports: NativeQuiImport[]
  kind: 'qui'
  nodes: NativeQuiNode[]
  props: NativeQuiProp[]
  source: string
}

export interface NativeQssDeclaration {
  name: string
  nameRange: NativeUiRange
  range: NativeUiRange
  value: string
  valueRange: NativeUiRange
}

export interface NativeQssRule {
  declarations: NativeQssDeclaration[]
  range: NativeUiRange
  selector: string
  selectorRange: NativeUiRange
}

export interface NativeQssAtRule {
  body?: string
  kind: string
  prelude: string
  range: NativeUiRange
}

export interface NativeQssDocument {
  atRules: NativeQssAtRule[]
  diagnostics: NativeUiDiagnostic[]
  kind: 'qss'
  rules: NativeQssRule[]
  source: string
}

export type NativeUiDocument = NativeQuiDocument | NativeQssDocument

export interface NativeUiComponentDefinition {
  description: string
  kind: 'base' | 'capability' | 'composite' | 'project'
  name: string
  props?: readonly string[]
  slots?: readonly string[]
  styleParts?: readonly string[]
}

export interface NativeQssPropertyDefinition {
  description: string
  name: string
  nativeWgpu: boolean
  phase: 'p0' | 'p1' | 'p2' | 'future'
}
