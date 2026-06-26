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
  content: 'children' | 'none' | 'text'
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
  values?: readonly NativeQssPropertyValueDefinition[]
}

export interface NativeQssPropertyValueDefinition {
  description: string
  insertText?: string
  label: string
}

export type NativeQssFontWeightValue
  = | 'bold'
    | 'normal'
    | number

export type NativeQssTextAlignValue
  = | 'center'
    | 'justify'
    | 'left'
    | 'right'

export type NativeQssObjectFitValue
  = | 'contain'
    | 'cover'
    | 'fill'
    | 'none'
    | 'scale-down'

export interface NativeQssBackgroundImageValue {
  assetType: string
  assetName: string
}

export interface NativeQssBackgroundPositionValue {
  x: number
  y: number
}

export interface NativeQssEdgeInsetsValue {
  bottom: number
  left: number
  right: number
  top: number
}

export interface NativeQssResolvedBounds {
  height?: number
  width?: number
  x?: number
  y?: number
}

export interface NativeQssResolvedStyle {
  backgroundColor?: string
  backgroundImage?: NativeQssBackgroundImageValue
  backgroundPosition?: NativeQssBackgroundPositionValue
  backgroundSize?: NativeQssObjectFitValue
  borderColor?: string
  borderRadius?: number
  borderWidth?: number
  color?: string
  fontFamily?: string[]
  fontSize?: number
  fontWeight?: NativeQssFontWeightValue
  lineHeight?: number
  objectFit?: NativeQssObjectFitValue
  opacity?: number
  padding?: NativeQssEdgeInsetsValue
  textAlign?: NativeQssTextAlignValue
}

export interface NativeQssResolvedNodeStyle {
  bounds?: NativeQssResolvedBounds
  style: NativeQssResolvedStyle
  visible?: boolean
  zIndex?: number
}

export interface NativeUiSurfaceProjection {
  root?: NativeUiSurfaceNodeProjection
}

export interface NativePackageProvenance {
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export type NativeUiSurfaceNodeKind
  = | 'Backdrop'
    | 'Box'
    | 'Button'
    | 'Column'
    | 'Divider'
    | 'Fragment'
    | 'Grid'
    | 'Image'
    | 'Layer'
    | 'Panel'
    | 'RichText'
    | 'Row'
    | 'SafeArea'
    | 'Scroll'
    | 'Spacer'
    | 'Stack'
    | 'Text'

export interface NativeUiSurfaceRect {
  height: number
  width: number
  x: number
  y: number
}

export interface NativeUiSurfaceIntentProjection {
  action?: string
  event: NativeQuiActionEvent
  metadata?: Record<string, NativeQuiActionArgumentValue>
}

export interface NativeUiSurfaceNodeProjection {
  bounds: NativeUiSurfaceRect
  children?: NativeUiSurfaceNodeProjection[]
  id: string
  image?: NativeQssBackgroundImageValue
  intent?: NativeUiSurfaceIntentProjection
  kind: NativeUiSurfaceNodeKind
  opacity?: number
  provenance?: NativePackageProvenance
  scrollOffsetX?: number
  scrollOffsetY?: number
  style?: NativeQssResolvedStyle
  text?: string
  visible?: boolean
  zIndex?: number
}
