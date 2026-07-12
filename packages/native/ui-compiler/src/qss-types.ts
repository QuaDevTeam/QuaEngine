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

export type NativeQssBoxSizingValue
  = | 'border-box'
    | 'content-box'

export type NativeQssPositionValue
  = | 'absolute'
    | 'relative'

export type NativeQssPointerEventsValue
  = | 'auto'
    | 'none'

export type NativeQssAlignItemsValue
  = | 'center'
    | 'flex-end'
    | 'flex-start'

export type NativeQssJustifyContentValue
  = | NativeQssAlignItemsValue
    | 'space-around'
    | 'space-between'
    | 'space-evenly'

export interface NativeQssBackgroundImageValue {
  assetType: string
  assetName: string
}

export interface NativeQssGradientValue {
  angleDegrees?: number
  centerX?: number
  centerY?: number
  endColor: string
  kind: 'linear' | 'radial'
  radius?: number
  startColor: string
}

export interface NativeQssFilterValue {
  brightness: number
  saturate: number
}

export interface NativeQssTransformValue {
  originX: number
  originY: number
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
}

export type NativeQssInteractivePseudoState
  = | 'active'
    | 'focus'
    | 'focus-visible'
    | 'hover'

export type NativeQssTransitionProperty
  = | 'all'
    | 'background-color'
    | 'border-color'
    | 'box-shadow'
    | 'color'
    | 'filter'
    | 'opacity'
    | 'scale'
    | 'transform'
    | 'translate'

export type NativeQssTransitionEasing
  = | 'ease'
    | 'ease-in'
    | 'ease-in-out'
    | 'ease-out'
    | 'linear'

export interface NativeQssTransitionValue {
  durationMs: number
  easing: NativeQssTransitionEasing
  property: NativeQssTransitionProperty
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
  alignItems?: NativeQssAlignItemsValue
  columnGap?: number
  justifyContent?: NativeQssJustifyContentValue
  margin?: NativeQssEdgeInsetsValue
  position?: NativeQssPositionValue
  rowGap?: number
  transform?: NativeQssTransformValue
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

export interface NativeQssShadowValue {
  blurRadius: number
  color: string
  inset: boolean
  offsetX: number
  offsetY: number
  spreadRadius: number
}

export interface NativeQssResolvedStyle {
  backgroundColor?: string
  backgroundGradient?: NativeQssGradientValue
  backgroundImage?: NativeQssBackgroundImageValue
  backgroundPosition?: NativeQssBackgroundPositionValue
  backgroundSize?: NativeQssObjectFitValue
  borderColor?: string
  borderRadius?: number
  borderStyle?: NativeQssBorderStyleValue
  borderWidth?: number
  boxShadow?: NativeQssShadowValue
  color?: string
  filter?: NativeQssFilterValue
  fontFamily?: string[]
  fontSize?: number
  fontStyle?: NativeQssFontStyleValue
  fontWeight?: NativeQssFontWeightValue
  letterSpacing?: number
  lineHeight?: number
  objectFit?: NativeQssObjectFitValue
  objectPosition?: NativeQssBackgroundPositionValue
  opacity?: number
  padding?: NativeQssEdgeInsetsValue
  textAlign?: NativeQssTextAlignValue
  textDecoration?: NativeQssTextDecorationValue
  textOverflow?: NativeQssTextOverflowValue
  textTransform?: NativeQssTextTransformValue
  textShadow?: NativeQssShadowValue
  whiteSpace?: NativeQssWhiteSpaceValue
}

export interface NativeQssResolvedNodeStyle {
  bounds?: NativeQssResolvedBounds
  clipChildren?: boolean
  interactive?: boolean
  layout?: NativeQssResolvedLayout
  stateStyles?: Partial<Record<NativeQssInteractivePseudoState, NativeQssResolvedStateStyle>>
  style: NativeQssResolvedStyle
  transitions?: NativeQssTransitionValue[]
  visible?: boolean
  zIndex?: number
}

export interface NativeQssResolvedStateStyle {
  layout?: Pick<NativeQssResolvedLayout, 'transform'>
  style: NativeQssResolvedStyle
}
