export type SceneHostResourceKind = 'texture' | 'spriteFrame' | 'audio' | 'video' | 'font' | 'renderTexture' | 'custom'
export type SceneHostPlane = 'root' | 'frame' | 'viewport' | 'stage' | 'scene' | 'subject' | 'safe' | 'screen'
export type SceneHostInputKind = 'pointer' | 'keyboard' | 'gamepad' | 'focus'

export interface SceneHostVec2 {
  x: number
  y: number
}

export interface SceneHostSize {
  width: number
  height: number
}

export interface SceneHostRect extends SceneHostVec2, SceneHostSize {}

export interface SceneHostInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Parent-local logical units, top-left origin, +Y down. x/y position the
 * untransformed top-left; anchors (0..1, top-left = 0,0) set the rotation/scale pivot.
 * The stage node alone maps logical units into container units.
 */
export interface SceneHostTransform {
  x?: number
  y?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  opacity?: number
  zIndex?: number
  anchorX?: number
  anchorY?: number
  clip?: Partial<SceneHostRect>
}

export interface SceneHostTextStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: string
  lineHeight?: number
  color?: string
  align?: string
  letterSpacing?: number
  verticalAlign?: 'top' | 'center' | 'bottom'
  padding?: { top: number, right: number, bottom: number, left: number }
}

/** Native drawing options, in logical units; hosts may support a subset. */
export interface SceneHostBoxStyle {
  /** Optional semantic decoration; unsupported hosts may draw a plain box. */
  shape?: 'chevron-down' | 'chevron-up'
  boxShadow?: { color: string, offsetX: number, offsetY: number, blurRadius: number, spreadRadius: number, inset: boolean }
  backgroundColor?: string
  backgroundGradient?: { kind: 'linear' | 'radial', angleDegrees?: number, centerX?: number, centerY?: number, radius?: number, stops: { color: string, position: number }[] }
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  borderTopWidth?: number
  borderRightWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderTopColor?: string
  borderRightColor?: string
  borderBottomColor?: string
  borderLeftColor?: string
}

export type SceneHostSpriteMode = 'sprite' | 'video' | 'sliced' | 'tiled'
export type SceneHostBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add' | string

export interface SceneHostSpriteFrame extends SceneHostRect {
  offsetX?: number
  offsetY?: number
}

export interface SceneHostSpriteFilter {
  blur?: number
  brightness?: number
  contrast?: number
  saturate?: number
  hueRotate?: number
  grayscale?: number
  sepia?: number
  dropShadow?: string
}

export interface SceneHostSpriteMask {
  assetName?: string
  assetType?: string
  resource?: SceneHostResource
  resourceId?: string
  mode?: string
  position?: string
  size?: string
  repeat?: string
}

export interface SceneHostSpriteComposition {
  blendMode?: SceneHostBlendMode
  isolation?: boolean
  filter?: Readonly<SceneHostSpriteFilter>
  mask?: Readonly<SceneHostSpriteMask>
}

export interface SceneHostSpriteStateOptions {
  resource?: SceneHostResource
  resourceId?: string
  tint?: string
  opacity?: number
  metadata?: Record<string, unknown>
}

export interface SceneHostSpriteOptions {
  /** Video transport intent; native hosts may implement a subset. */
  video?: { loop?: boolean, muted?: boolean, volume?: number, playbackRate?: number, seekMs?: number, offsetMs?: number }
  lighting?: { ambient?: readonly number[], shade?: { color: readonly number[], from: readonly number[], to: readonly number[] } }
  mode?: SceneHostSpriteMode
  slice?: Partial<SceneHostInsets>
  fill?: boolean
  contentInsets?: Partial<SceneHostInsets>
  tint?: string
  opacity?: number
  frame?: Readonly<SceneHostSpriteFrame>
  mask?: Readonly<SceneHostSpriteMask>
  blendMode?: SceneHostBlendMode
  filter?: Readonly<SceneHostSpriteFilter>
  composition?: Readonly<SceneHostSpriteComposition>
  states?: Partial<Record<string, SceneHostSpriteStateOptions>>
  metadata?: Record<string, unknown>
}

export type SceneHostControlKind
  = | 'button'
    | 'input'
    | 'textarea'
    | 'select'
    | 'toggle'
    | 'slider'
    | 'panel'
    | 'tab'
    | 'label'

export interface SceneHostControlOption {
  label: string
  value: string
  selected?: boolean
  disabled?: boolean
  metadata?: Record<string, unknown>
}

export interface SceneHostControlOptions {
  kind: SceneHostControlKind
  value?: string
  checked?: boolean
  options?: readonly SceneHostControlOption[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  selected?: boolean
  label?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface SceneHostNode {
  readonly id: string
  readonly kind: string
  name?: string
}

export interface SceneHostHitTestResult {
  node: SceneHostNode
  metadata?: Record<string, unknown>
}

export interface SceneHostResource {
  readonly id: string
  readonly kind: SceneHostResourceKind
  readonly source?: string
  readonly mimeType?: string
  readonly width?: number
  readonly height?: number
  readonly duration?: number
  /** Native projection details; never used as asset identity or game state. */
  readonly metadata?: Readonly<{ renderTexture?: boolean }>
  native?: unknown
}

export interface SceneHostAudioHandle {
  readonly id: string
  play: () => Promise<void> | void
  pause: () => Promise<void> | void
  stop: () => Promise<void> | void
  setVolume: (volume: number) => void
  setLoop: (loop: boolean) => void
  setPlaybackRate?: (rate: number) => void
  setEq?: (bands: readonly unknown[]) => void
  seek?: (positionMs: number) => Promise<void> | void
  getPosition?: () => number | undefined
  onEnded?: (listener: () => void) => SceneHostDisposer
  dispose: () => Promise<void> | void
}

export interface SceneHostFileInfo {
  path: string
  size: number
  mtime?: number
}

export interface SceneHostInputEvent {
  kind: SceneHostInputKind
  phase?: 'down' | 'up' | 'move' | 'wheel' | 'focus' | 'blur'
  /** Container-local coordinates with top-left origin, before stage unscaling. */
  x?: number
  y?: number
  key?: string
  code?: string
  repeat?: boolean
  targetNode?: SceneHostNode
  metadata?: Record<string, unknown>
}

export type SceneHostDisposer = () => void
export type SceneHostInputListener = (event: SceneHostInputEvent) => Promise<void> | void

export interface SceneRuntimeHost {
  now: () => number
  /** Apply the engine-owned renderer frame limit; 0 restores the host default. */
  setTargetFrameRate?: (framesPerSecond: number) => void
  warn?: (message: string, metadata?: Record<string, unknown>) => void
  error?: (message: string, metadata?: Record<string, unknown>) => void
}

export interface SceneNodeHost {
  getRootNode: () => SceneHostNode
  /** Optional scene inspection for host tooling; contains only transient nodes. */
  getNodeChildren?: (node: SceneHostNode) => readonly SceneHostNode[]
  createNode: (kind: string, options?: { name?: string, parent?: SceneHostNode }) => SceneHostNode
  destroyNode: (node: SceneHostNode) => void
  appendChild: (parent: SceneHostNode, child: SceneHostNode) => void
  removeChild: (parent: SceneHostNode, child: SceneHostNode) => void
  clearChildren: (node: SceneHostNode) => void
  setNodeVisible: (node: SceneHostNode, visible: boolean) => void
  setNodeTransform: (node: SceneHostNode, transform: SceneHostTransform) => void
  measureText?: (text: string, style: SceneHostTextStyle, maxWidth: number) => SceneHostSize | undefined
  setNodeText: (node: SceneHostNode, text: string, style?: SceneHostTextStyle) => void
  setNodeRichText: (node: SceneHostNode, markup: string, style?: SceneHostTextStyle) => void
  setNodeSprite: (node: SceneHostNode, resource?: SceneHostResource, options?: SceneHostSpriteOptions) => void
  setNodeControl?: (node: SceneHostNode, control: SceneHostControlOptions) => void
  setNodeColor?: (node: SceneHostNode, color?: string) => void
  setNodeBoxStyle?: (node: SceneHostNode, style: SceneHostBoxStyle) => void
  setNodeMetadata?: (node: SceneHostNode, metadata: Record<string, unknown>) => void
  getNodeMetadata?: (node: SceneHostNode) => Record<string, unknown> | undefined
  /** Input point is already in logical stage coordinates; exclude hidden subtrees. */
  hitTest?: (root: SceneHostNode, point: SceneHostVec2, options?: {
    metadataKey?: string
    metadataKeys?: readonly string[]
    includeInvisible?: boolean
  }) => SceneHostHitTestResult | undefined
  getContainerSize: () => SceneHostSize
  getDevicePixelRatio?: () => number
  getSafeAreaInsets?: () => Partial<{ top: number, right: number, bottom: number, left: number }>
  onLayoutChange?: (listener: () => void) => SceneHostDisposer
}

export interface SceneAssetHost {
  loadBytes: (source: string) => Promise<Uint8Array>
  writeBytes: (path: string, bytes: Uint8Array) => Promise<void>
  readBytes: (path: string) => Promise<Uint8Array | undefined>
  deleteFile: (path: string) => Promise<void>
  listFiles: (root: string) => Promise<SceneHostFileInfo[]>
  /** Acquire one resource lease. Shared IDs must preserve identity and requested kind. */
  createResource: (kind: SceneHostResourceKind, data: Uint8Array, options?: {
    id?: string
    source?: string
    mimeType?: string
    metadata?: Record<string, unknown>
  }) => Promise<SceneHostResource>
  /** Acquire one lease for a native resource; release it when no longer used. */
  loadResource?: (kind: SceneHostResourceKind, source: string, options?: {
    id?: string
    mimeType?: string
    metadata?: Record<string, unknown>
  }) => Promise<SceneHostResource | undefined>
  /** Acquire an additional lease for an already live resource. */
  retainResource?: (resource: SceneHostResource) => void
  /** Release one lease; the last release destroys the host-owned native resource. */
  releaseResource: (resource: SceneHostResource) => void
}

export interface SceneAudioHost {
  createAudioHandle: (resource: SceneHostResource, options?: {
    id?: string
    loop?: boolean
    volume?: number
    playbackRate?: number
    bus?: string
  }) => Promise<SceneHostAudioHandle>
  setBusVolume?: (bus: string, volume: number) => void
  setBusEq?: (bus: string, bands: readonly unknown[]) => void
}

export interface SceneHostFontFaceOptions {
  id: string
  family: string
  assetName: string
  bundleName?: string
  locale?: string
  style?: string
  weight?: string | number
  stretch?: string
  display?: string
  unicodeRange?: string
  featureSettings?: string
  variationSettings?: string
  ascentOverride?: string
  descentOverride?: string
  lineGapOverride?: string
  contentPackageId?: string
  metadata?: Record<string, unknown>
}

export interface SceneFontHost {
  registerFontFace: (resource: SceneHostResource, options: SceneHostFontFaceOptions) => Promise<void> | void
  unregisterFontFace: (id: string) => Promise<void> | void
}

export interface SceneStorageHost {
  writeText: (path: string, value: string) => Promise<void>
  readText: (path: string) => Promise<string | undefined>
  writeBytes: (path: string, value: Uint8Array) => Promise<void>
  readBytes: (path: string) => Promise<Uint8Array | undefined>
  delete: (path: string) => Promise<void>
  list: (root: string) => Promise<SceneHostFileInfo[]>
  ensureDir: (path: string) => Promise<void>
  move?: (from: string, to: string) => Promise<void>
}

export interface SceneInputHost {
  onInput: (listener: SceneHostInputListener) => SceneHostDisposer
}

export interface SceneCaptureHost {
  captureBackdrop?: (viewport: SceneHostRect, options?: { downsample?: number }) => Promise<{ resource: SceneHostResource, dispose: () => void }>

  captureNode: (node: SceneHostNode, options?: {
    mimeType?: string
    quality?: number
    maxWidth?: number
    maxHeight?: number
  }) => Promise<SceneHostCaptureResult>
}

export interface SceneHostCaptureResult {
  bytes: Uint8Array
  mimeType: string
  width?: number
  height?: number
  capturedAt: number
}

export interface SceneSchedulerHost {
  requestFrame: (callback: (timestamp: number) => void) => number
  cancelFrame: (handle: number) => void
  setTimeout: (callback: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
}

export interface SceneHostCapabilities {
  localFiles?: boolean
  remoteFiles?: boolean
  writableStorage?: boolean
  input?: boolean
  audioEq?: boolean
  audioGainAboveUnity?: boolean
  audioPlaybackRate?: boolean
  video?: boolean
  capture?: boolean
  fonts?: boolean
  nativeAssets?: boolean
}

export interface SceneRuntimeHostBundle {
  runtime: SceneRuntimeHost
  nodes: SceneNodeHost
  assets: SceneAssetHost
  audio: SceneAudioHost
  fonts?: SceneFontHost
  storage: SceneStorageHost
  input: SceneInputHost
  capture?: SceneCaptureHost
  scheduler: SceneSchedulerHost
  capabilities?: SceneHostCapabilities
}

export type SceneHost = SceneRuntimeHostBundle
