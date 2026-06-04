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
  setNodeSprite: (node: CocosHostNode, resource?: CocosHostResource, options?: Record<string, unknown>) => void
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
  }) => Promise<{
    bytes: Uint8Array
    mimeType: string
    width?: number
    height?: number
    capturedAt: number
  }>
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
}

export interface CocosRuntimeHostBundle {
  runtime: CocosRuntimeHost
  nodes: CocosNodeHost
  assets: CocosAssetHost
  audio: CocosAudioHost
  storage: CocosStorageHost
  input: CocosInputHost
  capture?: CocosCaptureHost
  scheduler: CocosSchedulerHost
  capabilities?: CocosHostCapabilities
}

export type CocosHost = CocosRuntimeHostBundle
