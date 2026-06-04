export type CocosHostResourceKind = 'texture' | 'spriteFrame' | 'audio' | 'video' | 'font' | 'renderTexture' | 'custom'
export type CocosHostPlane = 'root' | 'frame' | 'viewport' | 'stage' | 'scene' | 'subject' | 'safe' | 'screen'
export type CocosHostInputKind = 'pointer' | 'keyboard' | 'gamepad' | 'focus'

export interface CocosHostVec2 {
  x: number
  y: number
}

export interface CocosHostSize {
  width: number
  height: number
}

export interface CocosHostRect extends CocosHostVec2, CocosHostSize {}

export interface CocosHostInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface CocosHostTransform {
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
}

export interface CocosHostTextStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: string
  lineHeight?: number
  color?: string
  align?: string
}

export type CocosHostSpriteMode = 'sprite' | 'video' | 'sliced' | 'tiled'
export type CocosHostBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add' | string

export interface CocosHostSpriteFrame extends CocosHostRect {
  offsetX?: number
  offsetY?: number
}

export interface CocosHostSpriteFilter {
  blur?: number
  brightness?: number
  contrast?: number
  saturate?: number
  hueRotate?: number
  grayscale?: number
  sepia?: number
  dropShadow?: string
}

export interface CocosHostSpriteMask {
  assetName?: string
  assetType?: string
  resource?: CocosHostResource
  resourceId?: string
  mode?: string
  position?: string
  size?: string
  repeat?: string
}

export interface CocosHostSpriteComposition {
  blendMode?: CocosHostBlendMode
  isolation?: boolean
  filter?: Readonly<CocosHostSpriteFilter>
  mask?: Readonly<CocosHostSpriteMask>
}

export interface CocosHostSpriteOptions {
  mode?: CocosHostSpriteMode
  slice?: Partial<CocosHostInsets>
  fill?: boolean
  contentInsets?: Partial<CocosHostInsets>
  tint?: string
  opacity?: number
  frame?: Readonly<CocosHostSpriteFrame>
  mask?: Readonly<CocosHostSpriteMask>
  blendMode?: CocosHostBlendMode
  filter?: Readonly<CocosHostSpriteFilter>
  composition?: Readonly<CocosHostSpriteComposition>
  metadata?: Record<string, unknown>
}

export type CocosHostControlKind
  = | 'button'
    | 'input'
    | 'textarea'
    | 'select'
    | 'toggle'
    | 'slider'
    | 'panel'
    | 'tab'
    | 'label'

export interface CocosHostControlOption {
  label: string
  value: string
  selected?: boolean
  disabled?: boolean
  metadata?: Record<string, unknown>
}

export interface CocosHostControlOptions {
  kind: CocosHostControlKind
  value?: string
  checked?: boolean
  options?: readonly CocosHostControlOption[]
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

export interface CocosHostNode {
  readonly id: string
  readonly kind: string
  name?: string
}

export interface CocosHostHitTestResult {
  node: CocosHostNode
  metadata?: Record<string, unknown>
}

export interface CocosHostResource {
  readonly id: string
  readonly kind: CocosHostResourceKind
  readonly source?: string
  readonly mimeType?: string
  readonly width?: number
  readonly height?: number
  readonly duration?: number
  native?: unknown
}

export interface CocosHostAudioHandle {
  readonly id: string
  play: () => Promise<void> | void
  pause: () => Promise<void> | void
  stop: () => Promise<void> | void
  setVolume: (volume: number) => void
  setLoop: (loop: boolean) => void
  setPlaybackRate?: (rate: number) => void
  seek?: (positionMs: number) => Promise<void> | void
  getPosition?: () => number | undefined
  onEnded?: (listener: () => void) => CocosHostDisposer
  dispose: () => Promise<void> | void
}

export interface CocosHostFileInfo {
  path: string
  size: number
  mtime?: number
}

export interface CocosHostInputEvent {
  kind: CocosHostInputKind
  phase?: 'down' | 'up' | 'move' | 'wheel' | 'focus' | 'blur'
  x?: number
  y?: number
  key?: string
  code?: string
  repeat?: boolean
  targetNode?: CocosHostNode
  metadata?: Record<string, unknown>
}

export type CocosHostDisposer = () => void
export type CocosHostInputListener = (event: CocosHostInputEvent) => Promise<void> | void

export interface CocosRuntimeHost {
  now: () => number
  warn?: (message: string, metadata?: Record<string, unknown>) => void
  error?: (message: string, metadata?: Record<string, unknown>) => void
}

export interface CocosNodeHost {
  getRootNode: () => CocosHostNode
  createNode: (kind: string, options?: { name?: string, parent?: CocosHostNode }) => CocosHostNode
  destroyNode: (node: CocosHostNode) => void
  appendChild: (parent: CocosHostNode, child: CocosHostNode) => void
  removeChild: (parent: CocosHostNode, child: CocosHostNode) => void
  clearChildren: (node: CocosHostNode) => void
  setNodeVisible: (node: CocosHostNode, visible: boolean) => void
  setNodeTransform: (node: CocosHostNode, transform: CocosHostTransform) => void
  setNodeText: (node: CocosHostNode, text: string, style?: CocosHostTextStyle) => void
  setNodeRichText: (node: CocosHostNode, markup: string, style?: CocosHostTextStyle) => void
  setNodeSprite: (node: CocosHostNode, resource?: CocosHostResource, options?: CocosHostSpriteOptions) => void
  setNodeControl?: (node: CocosHostNode, control: CocosHostControlOptions) => void
  setNodeColor?: (node: CocosHostNode, color?: string) => void
  setNodeMetadata?: (node: CocosHostNode, metadata: Record<string, unknown>) => void
  getNodeMetadata?: (node: CocosHostNode) => Record<string, unknown> | undefined
  hitTest?: (root: CocosHostNode, point: CocosHostVec2, options?: {
    metadataKey?: string
    includeInvisible?: boolean
  }) => CocosHostHitTestResult | undefined
  getContainerSize: () => CocosHostSize
  getDevicePixelRatio?: () => number
  getSafeAreaInsets?: () => Partial<{ top: number, right: number, bottom: number, left: number }>
}

export interface CocosAssetHost {
  loadBytes: (source: string) => Promise<Uint8Array>
  writeBytes: (path: string, bytes: Uint8Array) => Promise<void>
  readBytes: (path: string) => Promise<Uint8Array | undefined>
  deleteFile: (path: string) => Promise<void>
  listFiles: (root: string) => Promise<CocosHostFileInfo[]>
  createResource: (kind: CocosHostResourceKind, data: Uint8Array, options?: {
    id?: string
    source?: string
    mimeType?: string
    metadata?: Record<string, unknown>
  }) => Promise<CocosHostResource>
  loadResource?: (kind: CocosHostResourceKind, source: string, options?: {
    id?: string
    mimeType?: string
    metadata?: Record<string, unknown>
  }) => Promise<CocosHostResource | undefined>
  retainResource?: (resource: CocosHostResource) => void
  releaseResource: (resource: CocosHostResource) => void
}

export interface CocosAudioHost {
  createAudioHandle: (resource: CocosHostResource, options?: {
    id?: string
    loop?: boolean
    volume?: number
    playbackRate?: number
    bus?: string
  }) => Promise<CocosHostAudioHandle>
  setBusVolume?: (bus: string, volume: number) => void
  setBusEq?: (bus: string, bands: readonly unknown[]) => void
}

export interface CocosHostFontFaceOptions {
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

export interface CocosFontHost {
  registerFontFace: (resource: CocosHostResource, options: CocosHostFontFaceOptions) => Promise<void> | void
  unregisterFontFace: (id: string) => Promise<void> | void
}

export interface CocosStorageHost {
  writeText: (path: string, value: string) => Promise<void>
  readText: (path: string) => Promise<string | undefined>
  writeBytes: (path: string, value: Uint8Array) => Promise<void>
  readBytes: (path: string) => Promise<Uint8Array | undefined>
  delete: (path: string) => Promise<void>
  list: (root: string) => Promise<CocosHostFileInfo[]>
  ensureDir: (path: string) => Promise<void>
  move?: (from: string, to: string) => Promise<void>
}

export interface CocosInputHost {
  onInput: (listener: CocosHostInputListener) => CocosHostDisposer
}

export interface CocosCaptureHost {
  captureNode: (node: CocosHostNode, options?: {
    mimeType?: string
    quality?: number
    maxWidth?: number
    maxHeight?: number
  }) => Promise<CocosHostCaptureResult>
}

export interface CocosHostCaptureResult {
  bytes: Uint8Array
  mimeType: string
  width?: number
  height?: number
  capturedAt: number
}

export interface CocosSchedulerHost {
  requestFrame: (callback: (timestamp: number) => void) => number
  cancelFrame: (handle: number) => void
  setTimeout: (callback: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
}

export interface CocosHostCapabilities {
  localFiles?: boolean
  remoteFiles?: boolean
  writableStorage?: boolean
  input?: boolean
  audioEq?: boolean
  audioPlaybackRate?: boolean
  video?: boolean
  capture?: boolean
  fonts?: boolean
  nativeAssets?: boolean
}

export interface CocosRuntimeHostBundle {
  runtime: CocosRuntimeHost
  nodes: CocosNodeHost
  assets: CocosAssetHost
  audio: CocosAudioHost
  fonts?: CocosFontHost
  storage: CocosStorageHost
  input: CocosInputHost
  capture?: CocosCaptureHost
  scheduler: CocosSchedulerHost
  capabilities?: CocosHostCapabilities
}

export type CocosHost = CocosRuntimeHostBundle
