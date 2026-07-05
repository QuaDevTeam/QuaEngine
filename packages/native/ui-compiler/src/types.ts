import type { NativeQssDocument } from './qss-types'

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
  groupId?: number
  name: string
  nameRange: NativeUiRange
  range: NativeUiRange
  value?: string
  valueRange?: NativeUiRange
}

export type NativeQuiActionNamespace = 'choice' | 'save' | 'settings' | 'ui'

export type NativeQuiActionEvent = 'choice/select' | 'ui/intent'

export type NativeQuiActionArgumentValue = boolean | null | number | string

export interface NativeQuiActionArgument {
  kind: 'expression' | 'literal' | 'reference'
  source: string
  value?: NativeQuiActionArgumentValue
}

export interface NativeQuiActionDescriptor {
  action: string
  arguments: NativeQuiActionArgument[]
  event: NativeQuiActionEvent
  name: string
  namespace: NativeQuiActionNamespace
  range?: NativeUiRange
  source: string
  valueRange?: NativeUiRange
}

export interface NativeQuiAstNode {
  actions: NativeQuiActionDescriptor[]
  bodyRange?: NativeUiRange
  children: NativeQuiAstNode[]
  classes: string[]
  kind: 'component' | 'slot'
  name: string
  nameRange: NativeUiRange
  props: NativeQuiProp[]
  range: NativeUiRange
}

export interface NativeQuiDocument {
  actions: NativeQuiActionDescriptor[]
  diagnostics: NativeUiDiagnostic[]
  imports: NativeQuiImport[]
  kind: 'qui'
  nodes: NativeQuiNode[]
  props: NativeQuiProp[]
  source: string
  tree: NativeQuiAstNode[]
}

export type NativeUiDocument = NativeQuiDocument | NativeQssDocument

export interface NativeUiComponentDefinition {
  content: 'children' | 'none' | 'text'
  description: string
  kind: 'base' | 'capability' | 'composite' | 'project'
  name: string
  props?: readonly string[]
  slots?: readonly string[]
  styleParts?: readonly string[]
}

export type {
  NativeQssAlignItemsValue,
  NativeQssAtRule,
  NativeQssBackgroundImageValue,
  NativeQssBackgroundPositionValue,
  NativeQssBorderStyleValue,
  NativeQssBoxSizingValue,
  NativeQssDeclaration,
  NativeQssDocument,
  NativeQssEdgeInsetsValue,
  NativeQssFontStyleValue,
  NativeQssFontWeightValue,
  NativeQssJustifyContentValue,
  NativeQssObjectFitValue,
  NativeQssPointerEventsValue,
  NativeQssPropertyDefinition,
  NativeQssPropertyValueDefinition,
  NativeQssPositionValue,
  NativeQssResolvedBounds,
  NativeQssResolvedLayout,
  NativeQssResolvedNodeStyle,
  NativeQssResolvedStyle,
  NativeQssRule,
  NativeQssTextAlignValue,
  NativeQssTextDecorationValue,
  NativeQssTextOverflowValue,
  NativeQssTextTransformValue,
  NativeQssWhiteSpaceValue,
} from './qss-types'

export type {
  NativePackageProvenance,
  NativeUiSurfaceIntentProjection,
  NativeUiSurfaceNodeKind,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceProjection,
  NativeUiSurfaceRect,
} from './surface-types'
