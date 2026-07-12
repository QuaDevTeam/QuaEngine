import type {
  NativeQuiActionArgumentValue,
  NativeQuiActionEvent,
} from './types'
import type {
  NativeQssBackgroundImageValue,
  NativeQssInteractivePseudoState,
  NativeQssResolvedStyle,
  NativeQssTransitionValue,
} from './qss-types'

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
  choiceId?: string
  event: NativeQuiActionEvent
  metadata?: Record<string, NativeQuiActionArgumentValue>
}

export interface NativeUiSurfaceControlOptionProjection {
  intent: NativeUiSurfaceIntentProjection
  label: string
}

export interface NativeUiSurfaceRangeControlProjection {
  kind: 'range'
  options: readonly NativeUiSurfaceControlOptionProjection[]
  parts: {
    progress: string
    thumb: string
    thumbHalo?: string
    value: string
  }
  selectedIndex: number
}

export interface NativeUiSurfaceSelectControlProjection {
  kind: 'select'
  options: readonly NativeUiSurfaceControlOptionProjection[]
  parts: {
    chevron: string
    value: string
  }
  selectedIndex: number
}

export interface NativeUiSurfaceSwitchControlProjection {
  kind: 'switch'
  options: readonly NativeUiSurfaceControlOptionProjection[]
  parts: {
    thumb: string
    track: string
    value: string
  }
  selectedIndex: number
}

export type NativeUiSurfaceControlProjection
  = | NativeUiSurfaceRangeControlProjection
    | NativeUiSurfaceSelectControlProjection
    | NativeUiSurfaceSwitchControlProjection

export interface NativeUiSurfaceNodeProjection {
  bounds: NativeUiSurfaceRect
  children?: NativeUiSurfaceNodeProjection[]
  clipChildren?: boolean
  control?: NativeUiSurfaceControlProjection
  id: string
  image?: NativeQssBackgroundImageValue
  intent?: NativeUiSurfaceIntentProjection
  kind: NativeUiSurfaceNodeKind
  opacity?: number
  provenance?: NativePackageProvenance
  role?: string
  scrollOffsetX?: number
  scrollOffsetY?: number
  style?: NativeQssResolvedStyle
  stateStyles?: Partial<Record<NativeQssInteractivePseudoState, NativeUiSurfaceNodeStateProjection>>
  text?: string
  transitions?: NativeQssTransitionValue[]
  visible: boolean
  zIndex?: number
}

export interface NativeUiSurfaceNodeStateProjection {
  bounds: NativeUiSurfaceRect
  style: NativeQssResolvedStyle
}
