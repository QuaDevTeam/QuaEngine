import type {
  NativeQuiActionArgumentValue,
  NativeQuiActionEvent,
} from './types'
import type { NativeQssBackgroundImageValue, NativeQssResolvedStyle } from './qss-types'

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

export interface NativeUiSurfaceNodeProjection {
  bounds: NativeUiSurfaceRect
  children?: NativeUiSurfaceNodeProjection[]
  clipChildren?: boolean
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
