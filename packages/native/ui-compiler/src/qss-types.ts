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

/** A single color stop in a multi-stop gradient. */
export interface NativeQssGradientStop {
  /** CSS color string. */
  color: string
  /** Normalized position 0–1 along the gradient line/radius. */
  position: number
}

export type NativeQssRadialGradientShape = 'circle' | 'ellipse'

export interface NativeQssGradientValue {
  angleDegrees?: number
  centerX?: number
  centerY?: number
  kind: 'linear' | 'radial'
  radius?: number
  shape?: NativeQssRadialGradientShape
  /** Ordered CSS color stops. Native QSS supports two to eight stops. */
  stops: NativeQssGradientStop[]
}

export interface NativeQssFilterValue {
  brightness: number
  saturate: number
  /** CSS `blur(Npx)` — 0 when absent. */
  blur?: number
  /** CSS `contrast(N)` — 1 when absent. */
  contrast?: number
  /** CSS `grayscale(N)` — 0 when absent. */
  grayscale?: number
  /** CSS `sepia(N)` — 0 when absent. */
  sepia?: number
  /** CSS `hue-rotate(Ndeg)` — 0 when absent. */
  hueRotate?: number
  /** CSS `invert(N)` — 0 when absent. */
  invert?: number
}

export interface NativeQssTransformValue {
  originX: number
  originY: number
  rotateDeg?: number
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

/**
 * Transition timing function. Besides the CSS keywords, a
 * `cubic-bezier(x1, y1, x2, y2)` string is accepted and forwarded verbatim to
 * the native renderer, which solves it as a true CSS curve.
 */
export type NativeQssTransitionEasing
  = | 'ease'
    | 'ease-in'
    | 'ease-in-out'
    | 'ease-out'
    | 'linear'
    | `cubic-bezier(${string})`

export interface NativeQssTransitionValue {
  /**
   * CSS `transition-delay` in milliseconds. Omitted when zero so existing
   * projections serialize unchanged; Rust defaults the field to 0.
   */
  delayMs?: number
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
  /** Per-child cross-axis alignment override (child property). */
  alignSelf?: NativeQssAlignItemsValue | 'auto'
  columnGap?: number
  /** Proportion of remaining main-axis space this child claims (child property). */
  flexGrow?: number
  /** Proportion of overflow this child absorbs on the main axis (child property). */
  flexShrink?: number
  /** Initial main-axis size before grow/shrink distribution (child property). */
  flexBasis?: number | 'auto'
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

/** Resolved value for CSS `backdrop-filter: blur(Npx)`. */
export interface NativeQssBackdropFilterValue {
  /** Gaussian blur radius in logical pixels. */
  blurRadius: number
}

export type NativeQssBorderImageRepeatValue = 'repeat' | 'stretch'

/** Resolved value for CSS `border-image-*` (nine-slice / skin). */
export interface NativeQssBorderImageValue {
  /**
   * Asset reference: `asset("path")` → `{ assetType, assetName }`.
   * Gradient sources are not supported for nine-slice.
   */
  source: NativeQssBackgroundImageValue
  /** Per-edge slice widths in logical pixels (top right bottom left). */
  slice: NativeQssEdgeInsetsValue
  /** Per-edge draw widths in logical pixels; defaults to slice when absent. */
  width?: NativeQssEdgeInsetsValue
  /** Whether the middle regions tile or stretch. Defaults to 'stretch'. */
  repeat?: NativeQssBorderImageRepeatValue
  /** When true the centre of the image fills the content box. */
  fill?: boolean
}

export interface NativeQssResolvedStyle {
  backdropFilter?: NativeQssBackdropFilterValue
  backgroundColor?: string
  backgroundGradient?: NativeQssGradientValue
  backgroundImage?: NativeQssBackgroundImageValue
  backgroundPosition?: NativeQssBackgroundPositionValue
  backgroundSize?: NativeQssObjectFitValue
  borderColor?: string
  borderBottomColor?: string
  borderLeftColor?: string
  borderRightColor?: string
  borderTopColor?: string
  borderImage?: NativeQssBorderImageValue
  borderRadius?: number
  borderTopLeftRadius?: number
  borderTopRightRadius?: number
  borderBottomRightRadius?: number
  borderBottomLeftRadius?: number
  borderStyle?: NativeQssBorderStyleValue
  borderWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderRightWidth?: number
  borderTopWidth?: number
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
  rotateDeg?: number
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
