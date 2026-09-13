/**
 * All component kinds mirroring the native renderer's NativeUiSurfaceNodeKind.
 * Fragment is a virtual container that is flattened during projection.
 */
export type QuiNodeKind =
  | 'Backdrop'
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
  | 'Select'
  | 'Slider'
  | 'Spacer'
  | 'Stack'
  | 'Switch'
  | 'Text'
  | 'Video'

/**
 * An intent that maps directly to a NativeUiSurfaceIntentProjection.
 * Create instances via the `ui` and `choice` helpers in intents.ts.
 */
export interface QuiIntent {
  readonly __quiIntent: true
  readonly event: 'choice/select' | 'ui/intent'
  readonly action?: string
  readonly choiceId?: string
  readonly metadata?: Readonly<Record<string, boolean | null | number | string>>
}

/** Recursive child type accepted by JSX expressions. */
export type QuiChildren =
  | QuiNode
  | null
  | undefined
  | false
  | readonly QuiChildren[]

/**
 * Intermediate node produced by the JSX runtime.
 * This is NOT the final projection — it still needs QSS resolution and
 * layout computation (see tsx-projection-compiler in native-ui-compiler).
 */
export interface QuiNode {
  readonly kind: QuiNodeKind
  readonly id?: string
  readonly classes: readonly string[]
  readonly props: Readonly<Record<string, unknown>>
  readonly children: readonly QuiNode[]
  readonly key?: string | number | null
}

// ─── Shared base props ─────────────────────────────────────────────────────

export interface QuiBaseProps {
  /** Resolved logical-stage geometry. Explicit values override QSS bounds. */
  x?: number
  y?: number
  width?: number
  height?: number
  id?: string
  class?: string
  show?: boolean
  opacity?: number
  /** Horizontal scroll offset in pixels (layout via QSS, offset via prop). */
  scrollX?: number
  /** Vertical scroll offset in pixels (layout via QSS, offset via prop). */
  scrollY?: number
}

// ─── Per-component prop types ───────────────────────────────────────────────

export interface ContainerProps extends QuiBaseProps {
  children?: QuiChildren
}

export type StackProps = ContainerProps
export interface BoxProps extends ContainerProps {
  onClick?: QuiIntent
}
export type RowProps = ContainerProps
export type ColumnProps = ContainerProps
export type LayerProps = ContainerProps
export interface PanelProps extends ContainerProps {
  onClick?: QuiIntent
}

export interface GridProps extends QuiBaseProps {
  columns?: number
  rows?: number
  gap?: number
  columnGap?: number
  rowGap?: number
  children?: QuiChildren
}

export interface SafeAreaProps extends QuiBaseProps {
  children?: QuiChildren
}

export interface ScrollProps extends QuiBaseProps {
  direction?: 'horizontal' | 'vertical'
  children?: QuiChildren
}

export type SpacerProps = QuiBaseProps
export type DividerProps = QuiBaseProps

export interface BackdropProps extends QuiBaseProps {
  /** Intent fired when the backdrop is tapped/clicked. */
  onDismiss?: QuiIntent
  children?: QuiChildren
}

export interface ButtonProps extends QuiBaseProps {
  /**
   * Button text — supply as JSX children:
   *   <Button onClick={ui.open('story')}>START</Button>
   */
  children?: string | number
  /** Intent fired when the button is activated. */
  onClick?: QuiIntent
  disabled?: boolean
}

// ─── Control components ─────────────────────────────────────────────────────

/** A labelled option in a Slider or Select control. */
export interface QuiControlOption {
  label: string
  intent: QuiIntent
}

export interface SliderProps extends QuiBaseProps {
  selectedIndex: number
  options: readonly QuiControlOption[]
  parts?: { progress?: string; thumb?: string; thumbHalo?: string; value?: string }
}

export interface SwitchProps extends QuiBaseProps {
  selectedIndex: number
  options: readonly [QuiControlOption, QuiControlOption]
  parts?: { track?: string; thumb?: string; value?: string }
}

export interface SelectProps extends QuiBaseProps {
  selectedIndex: number
  options: readonly QuiControlOption[]
  parts?: { value?: string; chevron?: string }
}

export interface TextProps extends QuiBaseProps {
  /** Text content — prefer JSX children: <Text>{value}</Text> */
  children?: string | number | boolean
}

export interface RichTextProps extends QuiBaseProps {
  children?: string
}

export interface ImageProps extends QuiBaseProps {
  src: string
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  objectPosition?: string
}

export interface VideoProps extends QuiBaseProps {
  /** Asset name as registered in the content package (e.g. `"videos/intro.gif"`). */
  src: string
  /** Asset type bucket. Defaults to `"videos"`. */
  assetType?: string
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  /** Loop playback continuously. Defaults to false. */
  looped?: boolean
  /** Suppress audio track. Defaults to false. */
  muted?: boolean
  /** Playback rate multiplier (1 = normal speed). */
  playbackRate?: number
}

// ─── JSX namespace ──────────────────────────────────────────────────────────
// Consumed by TypeScript when jsxImportSource = "@quajs/native-ui".

export namespace JSX {
  // QuiNode | null — JSX factory can return null for filtered/conditional nodes
  export type Element = QuiNode | null
  export interface ElementChildrenAttribute {
    children: object
  }
  export interface IntrinsicAttributes {
    key?: string | number | null
  }
}
