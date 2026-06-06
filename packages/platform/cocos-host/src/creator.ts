import type {
  CocosCaptureHost,
  CocosFontHost,
  CocosHost,
  CocosHostAudioHandle,
  CocosHostControlOptions,
  CocosHostDisposer,
  CocosHostFileInfo,
  CocosHostInputEvent,
  CocosHostInputListener,
  CocosHostNode,
  CocosHostRect,
  CocosHostResource,
  CocosHostResourceKind,
  CocosHostSize,
  CocosHostSpriteOptions,
  CocosHostTransform,
} from './index'

export interface CocosCreatorHostOptions {
  rootNode: unknown
  cc?: CocosCreatorModule
  writableRoot?: string
  files?: CocosCreatorFileBridge
  resources?: CocosCreatorResourceBridge
  audio?: CocosCreatorAudioBridge
  fonts?: CocosCreatorFontBridge
  input?: CocosCreatorInputBridge
  capture?: CocosCaptureHost
  layout?: CocosCreatorLayoutBridge
}

export interface CocosCreatorFileBridge {
  loadBytes?: (source: string) => Promise<Uint8Array>
  writeBytes?: (path: string, bytes: Uint8Array) => Promise<void>
  readBytes?: (path: string) => Promise<Uint8Array | undefined>
  delete?: (path: string) => Promise<void>
  list?: (root: string) => Promise<CocosHostFileInfo[]>
  ensureDir?: (path: string) => Promise<void>
  move?: (from: string, to: string) => Promise<void>
}

export interface CocosCreatorResourceBridge {
  loadResource?: (
    kind: CocosHostResourceKind,
    source: string,
    options: {
      id: string
      mimeType?: string
      metadata?: Record<string, unknown>
      cc?: CocosCreatorModule
    },
  ) => Promise<CocosHostResource | undefined>
  createResource?: (
    kind: CocosHostResourceKind,
    data: Uint8Array,
    options: {
      id: string
      source?: string
      mimeType?: string
      metadata?: Record<string, unknown>
      cc?: CocosCreatorModule
    },
  ) => Promise<CocosHostResource>
  retainResource?: (resource: CocosHostResource) => void
  releaseResource?: (resource: CocosHostResource) => void
}

export interface CocosCreatorAudioBridge {
  createAudioHandle?: (resource: CocosHostResource, options: {
    id: string
    loop: boolean
    volume: number
    playbackRate?: number
    bus?: string
    cc?: CocosCreatorModule
  }) => Promise<CocosHostAudioHandle>
  setBusVolume?: (bus: string, volume: number) => void
  setBusEq?: (bus: string, bands: readonly unknown[]) => void
}

export interface CocosCreatorFontBridge extends CocosFontHost {}

export interface CocosCreatorInputBridge {
  onInput?: (listener: CocosHostInputListener) => CocosHostDisposer
}

export interface CocosCreatorLayoutBridge {
  getContainerSize?: () => CocosHostSize
  getDevicePixelRatio?: () => number
  getSafeAreaInsets?: () => Partial<{ top: number, right: number, bottom: number, left: number }>
}

export interface CocosCreatorModule {
  Node?: new (name?: string) => unknown
  Sprite?: unknown
  Label?: unknown
  RichText?: unknown
  Button?: unknown
  EditBox?: unknown
  Toggle?: unknown
  Slider?: unknown
  UITransform?: unknown
  UIOpacity?: unknown
  AudioSource?: unknown
  Color?: new (r?: number, g?: number, b?: number, a?: number) => unknown
  input?: {
    on?: (type: unknown, callback: (event: unknown) => void, target?: unknown) => void
    off?: (type: unknown, callback: (event: unknown) => void, target?: unknown) => void
  }
  Input?: {
    EventType?: Record<string, unknown>
  }
  assetManager?: {
    loadRemote?: (url: string, options: unknown, callback: (error: unknown, asset: unknown) => void) => void
  }
  sys?: {
    now?: () => number
  }
  view?: {
    getVisibleSize?: () => CocosHostSize
    getDevicePixelRatio?: () => number
    getSafeAreaRect?: () => CocosHostRect
  }
  director?: {
    getScheduler?: () => unknown
  }
}

export function createCocosCreatorHost(options: CocosCreatorHostOptions): CocosHost {
  const files = new Map<string, Uint8Array>()
  const resources = new Map<string, CocosHostResource>()
  const nodesByNative = new WeakMap<object, CocosCreatorNode>()
  const childNodes = new Map<string, Set<CocosCreatorNode>>()
  const parentNodes = new Map<string, CocosCreatorNode>()
  const metadataByNode = new Map<string, Record<string, unknown>>()
  const root = wrapNode(options.rootNode, 'root', 'root')
  registerNode(root)

  const fileBridge = options.files
  const resourceBridge = options.resources
  const audioBridge = options.audio

  const nodeHost = {
    getRootNode: () => root,
    createNode(kind: string, nodeOptions: { name?: string, parent?: CocosHostNode } = {}) {
      const native = options.cc?.Node ? new options.cc.Node(nodeOptions.name || kind) : { name: nodeOptions.name || kind, children: [] }
      const node = wrapNode(native, kind, nodeOptions.name || kind)
      registerNode(node)
      ensureDefaultComponent(options.cc, node, kind)
      if (nodeOptions.parent) {
        nodeHost.appendChild(nodeOptions.parent, node)
      }
      return node
    },
    destroyNode(node: CocosHostNode) {
      const current = asCreatorNode(node)
      for (const child of [...(childNodes.get(current.id) || [])]) {
        nodeHost.destroyNode(child)
      }
      const parent = parentNodes.get(current.id)
      if (parent) {
        nodeHost.removeChild(parent, current)
      }
      ;(current.native as any)?.destroy?.()
      childNodes.delete(current.id)
      parentNodes.delete(current.id)
      metadataByNode.delete(current.id)
    },
    appendChild(parent: CocosHostNode, child: CocosHostNode) {
      const parentNode = asCreatorNode(parent)
      const childNode = asCreatorNode(child)
      const previous = parentNodes.get(childNode.id)
      if (previous) {
        nodeHost.removeChild(previous, childNode)
      }
      const parentNative = parentNode.native as any
      const childNative = childNode.native as any
      parentNative?.addChild?.(childNative)
      if (Array.isArray(parentNative?.children) && !parentNative.children.includes(childNative)) {
        parentNative.children.push(childNative)
      }
      let children = childNodes.get(parentNode.id)
      if (!children) {
        children = new Set()
        childNodes.set(parentNode.id, children)
      }
      children.add(childNode)
      parentNodes.set(childNode.id, parentNode)
    },
    removeChild(parent: CocosHostNode, child: CocosHostNode) {
      const parentNode = asCreatorNode(parent)
      const childNode = asCreatorNode(child)
      const parentNative = parentNode.native as any
      const childNative = childNode.native as any
      parentNative?.removeChild?.(childNative)
      childNodes.get(parentNode.id)?.delete(childNode)
      if (parentNodes.get(childNode.id)?.id === parentNode.id) {
        parentNodes.delete(childNode.id)
      }
    },
    clearChildren(node: CocosHostNode) {
      for (const child of [...(childNodes.get(asCreatorNode(node).id) || [])]) {
        nodeHost.destroyNode(child)
      }
      const native = asCreatorNode(node).native as any
      native?.removeAllChildren?.()
    },
    setNodeVisible(node: CocosHostNode, visible: boolean) {
      ;(asCreatorNode(node).native as any).active = visible
    },
    setNodeTransform(node: CocosHostNode, transform: CocosHostTransform) {
      applyTransform(options.cc, asCreatorNode(node), transform)
    },
    setNodeText(node: CocosHostNode, text: string, style = {}) {
      const native = asCreatorNode(node).native as any
      const label = ensureComponent(native, options.cc?.Label, 'cc.Label')
      if (label) {
        label.string = text
        applyTextStyle(options.cc, label, style)
      }
      else {
        native.text = text
      }
    },
    setNodeRichText(node: CocosHostNode, markup: string, style = {}) {
      const native = asCreatorNode(node).native as any
      const richText = ensureComponent(native, options.cc?.RichText, 'cc.RichText')
      if (richText) {
        richText.string = markup
        applyTextStyle(options.cc, richText, style)
      }
      else {
        native.richText = markup
      }
    },
    setNodeSprite(node: CocosHostNode, resource?: CocosHostResource, spriteOptions: CocosHostSpriteOptions = {}) {
      const native = asCreatorNode(node).native as any
      const sprite = ensureComponent(native, options.cc?.Sprite, 'cc.Sprite')
      if (sprite) {
        if (spriteOptions.mode === 'video')
          sprite.videoClip = resource?.native
        else
          sprite.spriteFrame = resource?.native
        applySpriteMode(options.cc, sprite, resource, spriteOptions)
        applySpriteVisualOptions(sprite, spriteOptions)
      }
      else {
        native.sprite = resource?.native
      }
      if (spriteOptions.tint)
        native.color = parseCocosColor(options.cc, spriteOptions.tint)
      if (spriteOptions.opacity !== undefined)
        applyNodeOpacity(options.cc, native, spriteOptions.opacity)
      native.spriteOptions = clonePlain(spriteOptions)
    },
    setNodeControl(node: CocosHostNode, control: CocosHostControlOptions) {
      const native = asCreatorNode(node).native as any
      applyControlComponent(options.cc, native, control)
      native.control = clonePlain(control)
    },
    setNodeColor(node: CocosHostNode, color?: string) {
      const native = asCreatorNode(node).native as any
      native.color = parseCocosColor(options.cc, color)
    },
    setNodeMetadata(node: CocosHostNode, metadata: Record<string, unknown>) {
      metadataByNode.set(asCreatorNode(node).id, { ...metadata })
    },
    getNodeMetadata(node: CocosHostNode) {
      const metadata = metadataByNode.get(asCreatorNode(node).id)
      return metadata ? { ...metadata } : undefined
    },
    hitTest(rootNode: CocosHostNode, point: { x: number, y: number }, hitOptions: { metadataKey?: string, includeInvisible?: boolean } = {}) {
      return hitTestNode(asCreatorNode(rootNode), point, childNodes, metadataByNode, hitOptions, identityMatrix())
    },
    getContainerSize: () => options.layout?.getContainerSize?.() || readNodeSize(options.cc, root) || options.cc?.view?.getVisibleSize?.() || { width: 1920, height: 1080 },
    getDevicePixelRatio: () => options.layout?.getDevicePixelRatio?.() || options.cc?.view?.getDevicePixelRatio?.() || globalThis.devicePixelRatio || 1,
    getSafeAreaInsets: () => options.layout?.getSafeAreaInsets?.() || safeAreaInsetsFromView(options.cc),
  }

  return {
    runtime: {
      now: () => creatorNow(options.cc),
    },
    nodes: nodeHost,
    assets: {
      async loadBytes(source) {
        const path = normalizePath(source, options.writableRoot)
        const cached = files.get(path)
        if (cached)
          return new Uint8Array(cached)
        if (fileBridge?.loadBytes)
          return fileBridge.loadBytes(path)
        if (isRemoteUrl(source) && globalThis.fetch) {
          const response = await globalThis.fetch(source)
          if (!response.ok)
            throw new Error(`Failed to fetch Cocos asset bytes: ${source}`)
          return new Uint8Array(await response.arrayBuffer())
        }
        if (isRemoteUrl(source) && options.cc?.assetManager?.loadRemote) {
          const remoteBytes = await loadRemoteBytes(options.cc, source)
          if (remoteBytes)
            return remoteBytes
          throw new Error(`Cocos Creator assetManager.loadRemote did not return byte data: ${source}`)
        }
        throw new Error(`Cocos Creator host cannot load raw bytes without a file bridge: ${source}`)
      },
      async writeBytes(path, bytes) {
        const normalized = normalizePath(path, options.writableRoot)
        if (fileBridge?.writeBytes) {
          await fileBridge.writeBytes(normalized, bytes)
          return
        }
        files.set(normalized, new Uint8Array(bytes))
      },
      async readBytes(path) {
        const normalized = normalizePath(path, options.writableRoot)
        const bridged = await fileBridge?.readBytes?.(normalized)
        if (bridged)
          return new Uint8Array(bridged)
        const bytes = files.get(normalized)
        return bytes ? new Uint8Array(bytes) : undefined
      },
      async deleteFile(path) {
        const normalized = normalizePath(path, options.writableRoot)
        await fileBridge?.delete?.(normalized)
        files.delete(normalized)
      },
      async listFiles(rootPath) {
        const normalized = normalizePath(rootPath, options.writableRoot)
        if (fileBridge?.list)
          return fileBridge.list(normalized)
        return listMemoryFiles(files, normalized)
      },
      async createResource(kind: CocosHostResourceKind, data, resourceOptions = {}) {
        const id = resourceOptions.id || `${kind}:${resources.size + 1}`
        const existing = resources.get(id)
        if (existing)
          return existing
        const resource = await resourceBridge?.createResource?.(kind, data, {
          id,
          source: resourceOptions.source,
          mimeType: resourceOptions.mimeType,
          metadata: resourceOptions.metadata,
          cc: options.cc,
        }) || {
          id,
          kind,
          source: resourceOptions.source,
          mimeType: resourceOptions.mimeType,
          width: Number(resourceOptions.metadata?.width) || undefined,
          height: Number(resourceOptions.metadata?.height) || undefined,
          duration: Number(resourceOptions.metadata?.duration) || undefined,
          native: new Uint8Array(data),
        }
        resources.set(id, resource)
        return resource
      },
      async loadResource(kind: CocosHostResourceKind, source, resourceOptions = {}) {
        const id = resourceOptions.id || `${kind}:${source}`
        const existing = resources.get(id)
        if (existing)
          return existing
        const resource = await resourceBridge?.loadResource?.(kind, source, {
          id,
          mimeType: resourceOptions.mimeType,
          metadata: resourceOptions.metadata,
          cc: options.cc,
        })
        if (!resource)
          return undefined
        resources.set(id, resource)
        return resource
      },
      retainResource(resource) {
        resourceBridge?.retainResource?.(resource)
      },
      releaseResource(resource) {
        resourceBridge?.releaseResource?.(resource)
        resources.delete(resource.id)
      },
    },
    audio: {
      async createAudioHandle(resource, handleOptions = {}) {
        if (audioBridge?.createAudioHandle) {
          return audioBridge.createAudioHandle(resource, {
            id: handleOptions.id || resource.id,
            loop: handleOptions.loop ?? false,
            volume: handleOptions.volume ?? 1,
            playbackRate: handleOptions.playbackRate,
            bus: handleOptions.bus,
            cc: options.cc,
          })
        }
        return createFallbackAudioHandle(resource, handleOptions)
      },
      setBusVolume: audioBridge?.setBusVolume,
      setBusEq: audioBridge?.setBusEq,
    },
    fonts: options.fonts,
    storage: {
      async writeText(path, value) {
        const bytes = new TextEncoder().encode(value)
        await this.writeBytes(path, bytes)
      },
      async readText(path) {
        const bytes = await this.readBytes(path)
        return bytes ? new TextDecoder().decode(bytes) : undefined
      },
      async writeBytes(path, value) {
        const normalized = normalizePath(path, options.writableRoot)
        if (fileBridge?.writeBytes) {
          await fileBridge.writeBytes(normalized, value)
          return
        }
        files.set(normalized, new Uint8Array(value))
      },
      async readBytes(path) {
        const normalized = normalizePath(path, options.writableRoot)
        const bridged = await fileBridge?.readBytes?.(normalized)
        if (bridged)
          return new Uint8Array(bridged)
        const bytes = files.get(normalized)
        return bytes ? new Uint8Array(bytes) : undefined
      },
      async delete(path) {
        const normalized = normalizePath(path, options.writableRoot)
        await fileBridge?.delete?.(normalized)
        files.delete(normalized)
      },
      async list(rootPath) {
        const normalized = normalizePath(rootPath, options.writableRoot)
        if (fileBridge?.list)
          return fileBridge.list(normalized)
        return listMemoryFiles(files, normalized)
      },
      async ensureDir(path) {
        await fileBridge?.ensureDir?.(normalizePath(path, options.writableRoot))
      },
      move: fileBridge?.move
        ? (from, to) => fileBridge.move!(normalizePath(from, options.writableRoot), normalizePath(to, options.writableRoot))
        : async (from, to) => {
          const source = normalizePath(from, options.writableRoot)
          const target = normalizePath(to, options.writableRoot)
          const bytes = files.get(source)
          if (bytes) {
            files.set(target, bytes)
            files.delete(source)
          }
        },
    },
    input: {
      onInput(listener) {
        if (options.input?.onInput)
          return options.input.onInput(listener)
        return bindCreatorInput(options.cc, root, listener)
      },
    },
    capture: options.capture,
    scheduler: {
      requestFrame(callback) {
        return setTimeout(() => callback(creatorNow(options.cc)), 16) as unknown as number
      },
      cancelFrame(handle) {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
      },
      setTimeout(callback, ms) {
        return setTimeout(callback, ms) as unknown as number
      },
      clearTimeout(handle) {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
      },
    },
    capabilities: {
      localFiles: Boolean(fileBridge?.loadBytes || fileBridge?.readBytes),
      remoteFiles: Boolean(globalThis.fetch || options.cc?.assetManager?.loadRemote),
      writableStorage: Boolean(fileBridge?.writeBytes || options.writableRoot),
      input: Boolean(options.input?.onInput || options.cc?.input || (root.native as any)?.on),
      audioEq: Boolean(audioBridge?.setBusEq),
      audioPlaybackRate: Boolean(audioBridge?.createAudioHandle),
      video: true,
      capture: Boolean(options.capture),
      fonts: Boolean(options.fonts?.registerFontFace),
      nativeAssets: Boolean(resourceBridge?.loadResource),
    },
  }

  function registerNode(node: CocosCreatorNode): void {
    if (node.native && typeof node.native === 'object') {
      nodesByNative.set(node.native, node)
    }
    childNodes.set(node.id, childNodes.get(node.id) || new Set())
  }
}

interface CocosCreatorNode extends CocosHostNode {
  native: unknown
}

function wrapNode(native: unknown, kind: string, name?: string): CocosCreatorNode {
  return {
    id: `${kind}:${Math.random().toString(36).slice(2)}`,
    kind,
    name,
    native,
  }
}

function asCreatorNode(node: CocosHostNode): CocosCreatorNode {
  return node as CocosCreatorNode
}

function ensureDefaultComponent(cc: CocosCreatorModule | undefined, node: CocosCreatorNode, kind: string): void {
  const native = node.native as any
  if (kind.includes('label') || kind.includes('dialogue') || kind.includes('choice') || kind.includes('text')) {
    ensureComponent(native, cc?.Label, 'cc.Label')
  }
  if (kind.includes('rich')) {
    ensureComponent(native, cc?.RichText, 'cc.RichText')
  }
  if (kind.includes('sprite') || kind.includes('background') || kind.includes('character')) {
    ensureComponent(native, cc?.Sprite, 'cc.Sprite')
  }
}

function ensureComponent(native: any, component: unknown, componentName: string): any {
  const existing = native?.getComponent?.(component) || native?.getComponent?.(componentName)
  if (existing)
    return existing
  if (component) {
    try {
      return native?.addComponent?.(component)
    }
    catch {}
  }
  return undefined
}

function applyTransform(cc: CocosCreatorModule | undefined, node: CocosCreatorNode, transform: CocosHostTransform): void {
  const native = node.native as any
  if (transform.x !== undefined || transform.y !== undefined) {
    const current = readNativePosition(native)
    const nextX = transform.x ?? current.x
    const nextY = transform.y ?? current.y
    native?.setPosition?.(nextX, nextY)
    if (!native?.setPosition) {
      native.x = nextX
      native.y = nextY
    }
  }
  if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
    const current = readNativeScale(native)
    const nextScaleX = transform.scaleX ?? current.x
    const nextScaleY = transform.scaleY ?? current.y
    native?.setScale?.(nextScaleX, nextScaleY)
    if (!native?.setScale) {
      native.scaleX = nextScaleX
      native.scaleY = nextScaleY
    }
  }
  if (transform.rotation !== undefined) {
    native.angle = transform.rotation
  }
  if (transform.zIndex !== undefined) {
    native.priority = transform.zIndex
    native.zIndex = transform.zIndex
    native.setSiblingIndex?.(Math.max(0, Math.floor(transform.zIndex)))
  }
  const uiTransform = ensureComponent(native, cc?.UITransform, 'cc.UITransform')
  if (uiTransform) {
    if (transform.width !== undefined || transform.height !== undefined) {
      uiTransform.setContentSize?.(transform.width ?? uiTransform.width ?? 0, transform.height ?? uiTransform.height ?? 0)
      uiTransform.width = transform.width ?? uiTransform.width
      uiTransform.height = transform.height ?? uiTransform.height
      native.width = uiTransform.width
      native.height = uiTransform.height
    }
    if (transform.anchorX !== undefined || transform.anchorY !== undefined) {
      uiTransform.setAnchorPoint?.(transform.anchorX ?? uiTransform.anchorX ?? 0.5, transform.anchorY ?? uiTransform.anchorY ?? 0.5)
      uiTransform.anchorX = transform.anchorX ?? uiTransform.anchorX
      uiTransform.anchorY = transform.anchorY ?? uiTransform.anchorY
      native.anchorX = uiTransform.anchorX
      native.anchorY = uiTransform.anchorY
    }
  }
  else {
    if (transform.width !== undefined || transform.height !== undefined) {
      native.width = transform.width ?? native.width
      native.height = transform.height ?? native.height
    }
    if (transform.anchorX !== undefined || transform.anchorY !== undefined) {
      native.anchorX = transform.anchorX ?? native.anchorX
      native.anchorY = transform.anchorY ?? native.anchorY
    }
  }
  if (transform.opacity !== undefined) {
    applyNodeOpacity(cc, native, transform.opacity)
  }
  if (transform.clip !== undefined) {
    native.quaClip = { ...transform.clip }
  }
}

function readNativePosition(native: any): { x: number, y: number } {
  const position = native?.getPosition?.()
  return {
    x: finiteNumber(native?.x, finiteNumber(position?.x, 0) ?? 0) ?? 0,
    y: finiteNumber(native?.y, finiteNumber(position?.y, 0) ?? 0) ?? 0,
  }
}

function readNativeScale(native: any): { x: number, y: number } {
  const scale = native?.getScale?.()
  return {
    x: finiteNumber(native?.scaleX, finiteNumber(scale?.x, 1) ?? 1) ?? 1,
    y: finiteNumber(native?.scaleY, finiteNumber(scale?.y, 1) ?? 1) ?? 1,
  }
}

function readNativeRotation(native: any): number {
  return finiteNumber(native?.angle, finiteNumber(native?.rotation, 0) ?? 0) ?? 0
}

function readNativeAnchor(native: any, size: CocosHostSize): { x: number, y: number } {
  const uiTransform = native?.getComponent?.('cc.UITransform')
  const anchorX = finiteNumber(native?.anchorX, finiteNumber(uiTransform?.anchorX, 0) ?? 0) ?? 0
  const anchorY = finiteNumber(native?.anchorY, finiteNumber(uiTransform?.anchorY, 0) ?? 0) ?? 0
  return {
    x: anchorX * size.width,
    y: anchorY * size.height,
  }
}

function applySpriteMode(
  cc: CocosCreatorModule | undefined,
  sprite: any,
  resource: CocosHostResource | undefined,
  options: CocosHostSpriteOptions,
): void {
  const spriteType = (cc?.Sprite as any)?.Type || (cc?.Sprite as any)?.type || {}
  if (options.mode === 'sliced') {
    sprite.type = spriteType.SLICED ?? spriteType.sliced ?? sprite.type
  }
  else if (options.mode === 'tiled') {
    sprite.type = spriteType.TILED ?? spriteType.tiled ?? sprite.type
  }
  else if (options.mode === 'sprite' || !options.mode) {
    sprite.type = spriteType.SIMPLE ?? spriteType.simple ?? sprite.type
  }

  const sizeMode = (cc?.Sprite as any)?.SizeMode || {}
  if (options.mode === 'sliced' || options.mode === 'tiled') {
    sprite.sizeMode = sizeMode.CUSTOM ?? sprite.sizeMode
  }

  const frame = resource?.native as any
  const slice = options.slice
  if (frame && slice) {
    frame.insetTop = finiteNumber(slice.top, frame.insetTop)
    frame.insetRight = finiteNumber(slice.right, frame.insetRight)
    frame.insetBottom = finiteNumber(slice.bottom, frame.insetBottom)
    frame.insetLeft = finiteNumber(slice.left, frame.insetLeft)
  }
  if (options.fill !== undefined)
    sprite.fill = options.fill
  sprite.spriteOptions = clonePlain(options)
}

function applySpriteVisualOptions(sprite: any, options: CocosHostSpriteOptions): void {
  if (options.blendMode !== undefined)
    sprite.blendMode = options.blendMode
  if (options.composition?.blendMode !== undefined)
    sprite.compositionBlendMode = options.composition.blendMode
  if (options.composition?.isolation !== undefined)
    sprite.compositionIsolation = options.composition.isolation
  if (options.frame)
    sprite.spriteFrameRect = clonePlain(options.frame)
  if (options.mask)
    sprite.spriteMask = clonePlain(options.mask)
  if (options.filter)
    sprite.spriteFilter = clonePlain(options.filter)
  if (options.composition)
    sprite.spriteComposition = clonePlain(options.composition)
  if (options.states)
    sprite.spriteStates = clonePlain(options.states)
}

function applyControlComponent(cc: CocosCreatorModule | undefined, native: any, control: CocosHostControlOptions): void {
  if (control.kind === 'button') {
    const button = ensureComponent(native, cc?.Button, 'cc.Button')
    if (button)
      button.interactable = !control.disabled
    return
  }
  if (control.kind === 'input' || control.kind === 'textarea' || control.kind === 'select') {
    const editBox = ensureComponent(native, cc?.EditBox, 'cc.EditBox')
    if (editBox) {
      editBox.string = control.value ?? ''
      editBox.placeholder = control.placeholder ?? editBox.placeholder
      editBox.enabled = !(control.disabled || control.readonly)
      editBox.readOnly = Boolean(control.readonly)
    }
    return
  }
  if (control.kind === 'toggle') {
    const toggle = ensureComponent(native, cc?.Toggle, 'cc.Toggle')
    if (toggle) {
      toggle.isChecked = Boolean(control.checked)
      toggle.interactable = !(control.disabled || control.readonly)
    }
    return
  }
  if (control.kind === 'slider') {
    const slider = ensureComponent(native, cc?.Slider, 'cc.Slider')
    if (slider) {
      const min = finiteNumber(control.min, 0) ?? 0
      const max = finiteNumber(control.max, 1) ?? 1
      const value = finiteNumber(Number(control.value), min) ?? min
      slider.progress = max > min ? clamp((value - min) / (max - min), 0, 1) : 0
      slider.enabled = !(control.disabled || control.readonly)
    }
  }
}

function applyNodeOpacity(cc: CocosCreatorModule | undefined, native: any, opacityValue: number): void {
  const opacity = ensureComponent(native, cc?.UIOpacity, 'cc.UIOpacity')
  if (opacity) {
    opacity.opacity = Math.round(clamp(opacityValue, 0, 1) * 255)
  }
  else {
    native.opacity = opacityValue
  }
}

function applyTextStyle(cc: CocosCreatorModule | undefined, component: any, style: {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: string
  lineHeight?: number
  color?: string
  align?: string
}): void {
  if (style.fontSize !== undefined)
    component.fontSize = style.fontSize
  if (style.lineHeight !== undefined)
    component.lineHeight = style.lineHeight
  if (style.color)
    component.color = parseCocosColor(cc, style.color)
  if (style.align)
    component.horizontalAlign = style.align
}

function parseCocosColor(cc: CocosCreatorModule | undefined, color?: string): unknown {
  if (!color)
    return undefined
  const parsed = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color)
  if (!parsed)
    return color
  const hex = parsed[1]
  const alpha = parsed[2]
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const a = alpha ? Number.parseInt(alpha, 16) : 255
  return cc?.Color ? new cc.Color(r, g, b, a) : { r, g, b, a }
}

function readNodeSize(cc: CocosCreatorModule | undefined, node: CocosCreatorNode): CocosHostSize | undefined {
  const native = node.native as any
  const transform = native?.getComponent?.(cc?.UITransform) || native?.getComponent?.('cc.UITransform')
  const width = Number(transform?.width || native?.width)
  const height = Number(transform?.height || native?.height)
  return width > 0 && height > 0 ? { width, height } : undefined
}

function safeAreaInsetsFromView(cc: CocosCreatorModule | undefined): Partial<{ top: number, right: number, bottom: number, left: number }> {
  const visible = cc?.view?.getVisibleSize?.()
  const safe = cc?.view?.getSafeAreaRect?.()
  if (!visible || !safe)
    return {}
  return {
    left: safe.x,
    right: Math.max(0, visible.width - safe.x - safe.width),
    top: Math.max(0, visible.height - safe.y - safe.height),
    bottom: safe.y,
  }
}

function hitTestNode(
  root: CocosCreatorNode,
  point: { x: number, y: number },
  childNodes: Map<string, Set<CocosCreatorNode>>,
  metadataByNode: Map<string, Record<string, unknown>>,
  options: { metadataKey?: string, includeInvisible?: boolean },
  parentMatrix: HitTestMatrix,
): { node: CocosHostNode, metadata?: Record<string, unknown> } | undefined {
  const nodeMatrix = root.kind === 'stage' ? parentMatrix : multiplyMatrix(parentMatrix, creatorNodeMatrix(root))
  const children = [...(childNodes.get(root.id) || [])].sort((left, right) => {
    const lz = Number((left.native as any)?.priority || (left.native as any)?.zIndex || 0)
    const rz = Number((right.native as any)?.priority || (right.native as any)?.zIndex || 0)
    return rz - lz
  })
  for (const child of children) {
    const hit = hitTestNode(child, point, childNodes, metadataByNode, options, nodeMatrix)
    if (hit)
      return hit
  }
  const native = root.native as any
  if (!options.includeInvisible && native?.active === false)
    return undefined
  const metadata = metadataByNode.get(root.id)
  if (options.metadataKey && metadata?.[options.metadataKey] === undefined)
    return undefined
  if (!containsPoint(root, point, nodeMatrix))
    return undefined
  return { node: root, metadata: metadata ? { ...metadata } : undefined }
}

interface HitTestMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function creatorNodeMatrix(node: CocosCreatorNode): HitTestMatrix {
  const native = node.native as any
  const size = readNodeSize(undefined, node) || { width: 0, height: 0 }
  const position = readNativePosition(native)
  const scale = readNativeScale(native)
  const anchor = readNativeAnchor(native, size)
  let matrix = translateMatrix(position.x, position.y)
  matrix = multiplyMatrix(matrix, translateMatrix(anchor.x, anchor.y))
  matrix = multiplyMatrix(matrix, rotateMatrix(readNativeRotation(native)))
  matrix = multiplyMatrix(matrix, scaleMatrix(scale.x, scale.y))
  matrix = multiplyMatrix(matrix, translateMatrix(-anchor.x, -anchor.y))
  return matrix
}

function containsPoint(node: CocosCreatorNode, point: { x: number, y: number }, matrix: HitTestMatrix): boolean {
  const size = readNodeSize(undefined, node)
  if (!size)
    return true
  const { width, height } = size
  const inverse = invertMatrix(matrix)
  if (!inverse)
    return false
  const local = transformPoint(inverse, point)
  return local.x >= -1e-6 && local.x <= width + 1e-6 && local.y >= -1e-6 && local.y <= height + 1e-6
}

function identityMatrix(): HitTestMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

function translateMatrix(x: number, y: number): HitTestMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

function scaleMatrix(scaleX: number, scaleY: number): HitTestMatrix {
  return { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 }
}

function rotateMatrix(rotation: number): HitTestMatrix {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

function multiplyMatrix(left: HitTestMatrix, right: HitTestMatrix): HitTestMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

function invertMatrix(matrix: HitTestMatrix): HitTestMatrix | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-8)
    return undefined
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
}

function transformPoint(matrix: HitTestMatrix, point: { x: number, y: number }): { x: number, y: number } {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

function bindCreatorInput(
  cc: CocosCreatorModule | undefined,
  root: CocosCreatorNode,
  listener: CocosHostInputListener,
): CocosHostDisposer {
  const disposers: CocosHostDisposer[] = []
  const eventType = cc?.Input?.EventType || {}
  bindInputEvent(cc?.input, eventType.TOUCH_START || 'touch-start', event => listener(toPointerEvent(event, 'down')), disposers)
  bindInputEvent(cc?.input, eventType.TOUCH_MOVE || 'touch-move', event => listener(toPointerEvent(event, 'move')), disposers)
  bindInputEvent(cc?.input, eventType.TOUCH_END || 'touch-end', event => listener(toPointerEvent(event, 'up')), disposers)
  bindInputEvent(cc?.input, eventType.KEY_DOWN || 'keydown', event => listener(toKeyboardEvent(event, 'down')), disposers)
  bindInputEvent(cc?.input, eventType.KEY_UP || 'keyup', event => listener(toKeyboardEvent(event, 'up')), disposers)
  const native = root.native as any
  bindNodeEvent(native, 'touchstart', event => listener(toPointerEvent(event, 'down')), disposers)
  bindNodeEvent(native, 'touchmove', event => listener(toPointerEvent(event, 'move')), disposers)
  bindNodeEvent(native, 'touchend', event => listener(toPointerEvent(event, 'up')), disposers)
  return () => {
    for (const dispose of disposers)
      dispose()
  }
}

function bindInputEvent(input: CocosCreatorModule['input'] | undefined, type: unknown, callback: (event: unknown) => void, disposers: CocosHostDisposer[]): void {
  if (!input?.on || !input.off || !type)
    return
  input.on(type, callback)
  disposers.push(() => input.off?.(type, callback))
}

function bindNodeEvent(native: any, type: string, callback: (event: unknown) => void, disposers: CocosHostDisposer[]): void {
  if (!native?.on || !native.off)
    return
  native.on(type, callback)
  disposers.push(() => native.off(type, callback))
}

function toPointerEvent(event: unknown, phase: CocosHostInputEvent['phase']): CocosHostInputEvent {
  const record = event as any
  const location = record?.getUILocation?.() || record?.getLocation?.() || record?.location || {}
  return {
    kind: 'pointer',
    phase,
    x: Number(location.x ?? record?.x ?? 0),
    y: Number(location.y ?? record?.y ?? 0),
    metadata: { nativeEvent: event },
  }
}

function toKeyboardEvent(event: unknown, phase: CocosHostInputEvent['phase']): CocosHostInputEvent {
  const record = event as any
  const key = record?.key || record?.keyCode || record?.code
  return {
    kind: 'keyboard',
    phase,
    key: key === undefined ? undefined : String(key),
    code: record?.code === undefined ? undefined : String(record.code),
    repeat: Boolean(record?.repeat),
    metadata: { nativeEvent: event },
  }
}

function createFallbackAudioHandle(resource: CocosHostResource, options: { id?: string, loop?: boolean, volume?: number }): CocosHostAudioHandle {
  let playing = false
  let volume = options.volume ?? 1
  let loop = options.loop ?? false
  let positionMs = 0
  let eqBands: readonly unknown[] = []
  const endedListeners = new Set<() => void>()
  const handle = {
    id: options.id || resource.id,
    play: () => {
      playing = true
    },
    pause: () => {
      playing = false
    },
    stop: () => {
      playing = false
    },
    setVolume: (next: number) => {
      volume = next
    },
    setLoop: (next: boolean) => {
      loop = next
    },
    setEq: (bands: readonly unknown[]) => {
      eqBands = [...bands]
    },
    seek: (next: number) => {
      positionMs = next
    },
    getPosition: () => positionMs,
    onEnded: (listener: () => void) => {
      endedListeners.add(listener)
      return () => endedListeners.delete(listener)
    },
    dispose: () => {
      volume = 0
      loop = false
      playing = false
      endedListeners.clear()
    },
  }
  Object.defineProperties(handle, {
    playing: { get: () => playing },
    volume: { get: () => volume },
    loop: { get: () => loop },
    positionMs: { get: () => positionMs },
    eqBands: { get: () => eqBands },
    resource: { get: () => resource },
  })
  return handle
}

function normalizePath(path: string, root?: string): string {
  const normalized = path.replace(/^cocos:\/\//, '').replace(/^\/+/, '')
  if (!root)
    return normalized
  const normalizedRoot = root.replace(/\/+$/, '').replace(/^\/+/, '')
  return normalized.startsWith(`${normalizedRoot}/`) ? normalized : `${normalizedRoot}/${normalized}`
}

function creatorNow(cc: CocosCreatorModule | undefined): number {
  const now = cc?.sys?.now?.()
  return typeof now === 'number' && Number.isFinite(now) ? now : Date.now()
}

async function loadRemoteBytes(cc: CocosCreatorModule, source: string): Promise<Uint8Array | undefined> {
  const asset = await new Promise<unknown>((resolve, reject) => {
    cc.assetManager?.loadRemote?.(source, {}, (error, remoteAsset) => {
      if (error) {
        reject(error)
        return
      }
      resolve(remoteAsset)
    })
  })
  return remoteAssetBytes(asset)
}

async function remoteAssetBytes(value: unknown): Promise<Uint8Array | undefined> {
  const direct = await bytesFromValue(value)
  if (direct)
    return direct
  if (!value || typeof value !== 'object')
    return undefined
  const record = value as Record<string, unknown>
  for (const key of ['bytes', 'data', 'native', '_nativeAsset']) {
    const bytes = await bytesFromValue(record[key])
    if (bytes)
      return bytes
  }
  if (typeof record.text === 'string')
    return new TextEncoder().encode(record.text)
  return undefined
}

async function bytesFromValue(value: unknown): Promise<Uint8Array | undefined> {
  if (value instanceof Uint8Array)
    return new Uint8Array(value)
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (value && typeof value === 'object' && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function')
    return new Uint8Array(await (value as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer())
  return undefined
}

function listMemoryFiles(files: Map<string, Uint8Array>, rootPath: string): CocosHostFileInfo[] {
  return Array.from(files.entries())
    .filter(([path]) => path.startsWith(rootPath))
    .map(([path, bytes]) => ({ path, size: bytes.byteLength }))
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
