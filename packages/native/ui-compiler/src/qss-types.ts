import type { NativeUiDiagnostic, NativeUiRange } from './types'

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

export type NativeQssFontStyleValue
  = | 'italic'
    | 'normal'

export type NativeQssTextAlignValue
  = | 'center'
    | 'justify'
    | 'left'
    | 'right'

export type NativeQssTextDecorationValue
  = | 'line-through'
    | 'none'
    | 'underline'

export type NativeQssTextOverflowValue
  = | 'clip'
    | 'ellipsis'

export type NativeQssTextTransformValue
  = | 'capitalize'
    | 'lowercase'
    | 'none'
    | 'uppercase'

export type NativeQssWhiteSpaceValue
  = | 'normal'
    | 'nowrap'
    | 'pre'
    | 'pre-line'
    | 'pre-wrap'

export type NativeQssObjectFitValue
  = | 'contain'
    | 'cover'
    | 'fill'
    | 'none'
    | 'scale-down'

export type NativeQssBorderStyleValue
  = | 'none'
    | 'solid'

export type NativeQssPositionValue
  = | 'absolute'
    | 'relative'

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

export interface NativeQssResolvedLayout {
  columnGap?: number
  margin?: NativeQssEdgeInsetsValue
  position?: NativeQssPositionValue
  rowGap?: number
}

export interface NativeQssResolvedBounds {
  bottom?: number
  height?: number
  maxHeight?: number
  maxWidth?: number
  minHeight?: number
  minWidth?: number
  right?: number
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
  borderStyle?: NativeQssBorderStyleValue
  borderWidth?: number
  color?: string
  fontFamily?: string[]
  fontSize?: number
  fontStyle?: NativeQssFontStyleValue
  fontWeight?: NativeQssFontWeightValue
  letterSpacing?: number
  lineHeight?: number
  objectFit?: NativeQssObjectFitValue
  opacity?: number
  padding?: NativeQssEdgeInsetsValue
  textAlign?: NativeQssTextAlignValue
  textDecoration?: NativeQssTextDecorationValue
  textOverflow?: NativeQssTextOverflowValue
  textTransform?: NativeQssTextTransformValue
  whiteSpace?: NativeQssWhiteSpaceValue
}

export interface NativeQssResolvedNodeStyle {
  bounds?: NativeQssResolvedBounds
  clipChildren?: boolean
  layout?: NativeQssResolvedLayout
  style: NativeQssResolvedStyle
  visible?: boolean
  zIndex?: number
}
