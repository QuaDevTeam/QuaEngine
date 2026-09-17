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
  CocosRuntimeHost,
  CocosStorageHost,
} from './index'

export interface CocosCreatorHostOptions {
  rootNode: unknown
  runtime?: Partial<CocosRuntimeHost>
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
  /** Declare rate support only when returned handles implement setPlaybackRate. */
  playbackRate?: boolean
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
  onLayoutChange?: (listener: () => void) => CocosHostDisposer
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
  Vec3?: new (x?: number, y?: number, z?: number) => unknown
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
    on?: (event: string, callback: () => void) => void
    off?: (event: string, callback: () => void) => void
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
  let resourceSerial = 0
  const warned = new Set<string>()
  const warn = (message: string, metadata?: Record<string, unknown>) => {
    if (warned.has(message))
      return
    warned.add(message)
    ;(options.runtime?.warn || console.warn)(message, metadata)
  }
  const nodesByNative = new WeakMap<object, CocosCreatorNode>()
  const childNodes = new Map<string, Set<CocosCreatorNode>>()
  const parentNodes = new Map<string, CocosCreatorNode>()
  const slicedFrames = new Map<string, any>()
  const visualNodes = new Map<string, Map<string, any>>()
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
      visualNodes.delete(current.id)
      slicedFrames.get(current.id)?.destroy?.()
      slicedFrames.delete(current.id)
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
      projectTransform(childNode)
      sortChildren(parentNode)
    },
    removeChild(parent: CocosHostNode, child: CocosHostNode) {
      const parentNode = asCreatorNode(parent)
      const childNode = asCreatorNode(child)
      const parentNative = parentNode.native as any
      const childNative = childNode.native as any
      if (parentNative?.removeChild)
        parentNative.removeChild(childNative)
      else if (Array.isArray(parentNative?.children))
        parentNative.children = parentNative.children.filter((child: unknown) => child !== childNative)
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
      for (const visual of visualNodes.get(node.id)?.values() || [])
        visual.destroy?.()
      visualNodes.delete(node.id)
      native?.removeAllChildren?.()
    },
    setNodeVisible(node: CocosHostNode, visible: boolean) {
      ;(asCreatorNode(node).native as any).active = visible
    },
    setNodeTransform(node: CocosHostNode, transform: CocosHostTransform) {
      const current = asCreatorNode(node)
      Object.assign(current.transform, Object.fromEntries(Object.entries(transform).filter(([, value]) => value !== undefined)))
      projectTransform(current)
      for (const child of childNodes.get(current.id) || [])
        projectTransform(child)
      const parent = parentNodes.get(current.id)
      if (parent && transform.zIndex !== undefined)
        sortChildren(parent)
      if (transform.clip)
        warn('Cocos Creator clip projection requires a custom mask implementation; clip metadata is retained only.')
    },
    setNodeText(node: CocosHostNode, text: string, style = {}) {
      const native = asCreatorNode(node).native as any
      const label = presentationComponent(asCreatorNode(node), 'label', options.cc?.Label, 'cc.Label')
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
      const richText = presentationComponent(asCreatorNode(node), 'rich-text', options.cc?.RichText, 'cc.RichText')
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
      const sprite = presentationComponent(asCreatorNode(node), 'sprite', options.cc?.Sprite, 'cc.Sprite')
      if (sprite) {
        if (spriteOptions.mode === 'video') {
          warn('Cocos Creator video projection is unavailable without a custom node host.')
          sprite.spriteFrame = null
        }
        else {
          slicedFrames.get(node.id)?.destroy?.()
          slicedFrames.delete(node.id)
          const frame = resource?.native as any
          if (spriteOptions.slice && frame?.clone) {
            const copy = frame.clone()
            slicedFrames.set(node.id, copy)
            sprite.spriteFrame = copy
          }
          else {
            sprite.spriteFrame = frame ?? null
            if (spriteOptions.slice)
              warn('Cocos Creator cannot customize shared slice insets without SpriteFrame.clone; asset insets are used.')
          }
        }
        applySpriteMode(options.cc, sprite, resource, spriteOptions)
        applySpriteVisualOptions(sprite, spriteOptions)
      }
      else {
        native.sprite = resource?.native
      }
      if (spriteOptions.tint)
        (sprite || native).color = parseCocosColor(options.cc, spriteOptions.tint)
      if (spriteOptions.opacity !== undefined)
        applyNodeOpacity(options.cc, native, spriteOptions.opacity)
      if (spriteOptions.mask || spriteOptions.filter || spriteOptions.composition || spriteOptions.frame || spriteOptions.states || (spriteOptions.blendMode && spriteOptions.blendMode !== 'normal'))
        warn('Cocos Creator advanced sprite options require a custom material/control implementation; projection metadata is retained only.')
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
    hitTest(rootNode: CocosHostNode, point: { x: number, y: number }, hitOptions: { metadataKey?: string, metadataKeys?: readonly string[], includeInvisible?: boolean } = {}) {
      return hitTestNode(asCreatorNode(rootNode), point, childNodes, metadataByNode, hitOptions, identityMatrix())
    },
    onLayoutChange(listener: () => void) {
      if (options.layout?.onLayoutChange)
        return options.layout.onLayoutChange(listener)
      const native = root.native as any
      native?.on?.('size-changed', listener)
      options.cc?.view?.on?.('canvas-resize', listener)
      options.cc?.view?.on?.('design-resolution-changed', listener)
      return () => {
        native?.off?.('size-changed', listener)
        options.cc?.view?.off?.('canvas-resize', listener)
        options.cc?.view?.off?.('design-resolution-changed', listener)
      }
    },
    getContainerSize: () => options.layout?.getContainerSize?.() || readNodeSize(options.cc, root) || options.cc?.view?.getVisibleSize?.() || { width: 1920, height: 1080 },
    getDevicePixelRatio: () => options.layout?.getDevicePixelRatio?.() || options.cc?.view?.getDevicePixelRatio?.() || globalThis.devicePixelRatio || 1,
    getSafeAreaInsets: () => options.layout?.getSafeAreaInsets?.() || safeAreaInsetsFromView(options.cc),
  }

  return {
    runtime: {
      now: () => options.runtime?.now?.() ?? creatorNow(options.cc),
      warn,
      error: options.runtime?.error || console.error,
    },
    nodes: nodeHost,
    assets: {
      async loadBytes(source) {
        const path = normalizePath(source, options.writableRoot)
        const cached = files.get(path)
        if (cached)
          return new Uint8Array(cached)
        if (!isRemoteUrl(source) && fileBridge?.readBytes) {
          const bytes = await fileBridge.readBytes(path)
          if (bytes)
            return new Uint8Array(bytes)
        }
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
        warn('Cocos Creator has no persistent file writer; writes are kept in memory for this host instance only.')
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
        const id = resourceOptions.id || `${kind}:${++resourceSerial}`
        const existing = resources.get(id)
        if (existing)
          return existing
        if (!resourceBridge?.createResource && kind !== 'custom') {
          throw new Error(`Cocos Creator requires resources.createResource to decode ${kind} bytes into a native asset.`)
        }
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
        if (resources.get(resource.id) === resource)
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
        throw new Error('Cocos Creator audio playback requires an audio.createAudioHandle bridge.')
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
        warn('Cocos Creator has no persistent file writer; writes are kept in memory for this host instance only.')
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
        : async function (this: CocosStorageHost, from, to) {
          const source = normalizePath(from, options.writableRoot)
          const target = normalizePath(to, options.writableRoot)
          const bytes = await this.readBytes(source)
          if (!bytes)
            throw new Error(`Cocos Creator cannot move missing file: ${source}`)
          await this.writeBytes(target, bytes)
          await this.delete(source)
        },
    },
    input: {
      onInput(listener) {
        if (options.input?.onInput)
          return options.input.onInput(listener)
        return bindCreatorInput(options.cc, root, nodeHost.getContainerSize, listener)
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
      writableStorage: Boolean(fileBridge?.writeBytes && fileBridge.readBytes && fileBridge.delete && fileBridge.list),
      input: Boolean(options.input?.onInput || options.cc?.input || (root.native as any)?.on),
      audioEq: Boolean(audioBridge?.setBusEq),
      audioPlaybackRate: audioBridge?.playbackRate === true,
      video: false,
      capture: Boolean(options.capture),
      fonts: Boolean(options.fonts?.registerFontFace),
      nativeAssets: Boolean(resourceBridge?.loadResource),
    },
  }

  function projectTransform(node: CocosCreatorNode): void {
    const parent = parentNodes.get(node.id)
    const parentNative = parent?.native as any
    const parentUi = getComponent(parentNative, options.cc?.UITransform, 'cc.UITransform')
    const size = parent?.kind === 'root'
      ? nodeHost.getContainerSize()
      : { width: parent?.transform.width ?? 0, height: parent?.transform.height ?? 0 }
    const parentAnchor = parent?.kind === 'root'
      ? { x: parentUi?.anchorX ?? parentNative?.anchorX ?? 0, y: 1 - (parentUi?.anchorY ?? parentNative?.anchorY ?? 1) }
      : { x: parent?.transform.anchorX ?? 0, y: parent?.transform.anchorY ?? 0 }
    applyTransform(options.cc, node, {
      ...node.transform,
      x: (node.transform.x ?? 0) + (node.transform.anchorX ?? 0) * (node.transform.width ?? 0) - parentAnchor.x * size.width,
      y: parentAnchor.y * size.height - (node.transform.y ?? 0) - (node.transform.anchorY ?? 0) * (node.transform.height ?? 0),
      anchorX: node.transform.anchorX ?? 0,
      anchorY: 1 - (node.transform.anchorY ?? 0),
      rotation: -(node.transform.rotation ?? 0),
    })
    updatePresentation(node)
  }

  function presentationComponent(node: CocosCreatorNode, kind: string, component: unknown, componentName: string): any {
    if (!options.cc?.Node || !component)
      return ensureComponent(node.native, component, componentName)
    let visuals = visualNodes.get(node.id)
    if (!visuals) {
      visuals = new Map()
      visualNodes.set(node.id, visuals)
    }
    let visual = visuals.get(kind)
    if (!visual) {
      visual = new options.cc.Node(`qua-${kind}`)
      ;(node.native as any).addChild?.(visual)
      visuals.set(kind, visual)
    }
    if (kind === 'label' || kind === 'rich-text') {
      const other = visuals.get(kind === 'label' ? 'rich-text' : 'label')
      if (other)
        other.active = false
    }
    visual.active = true
    const projected = ensureComponent(visual, component, componentName)
    updatePresentation(node)
    return projected
  }

  function updatePresentation(node: CocosCreatorNode): void {
    const visuals = visualNodes.get(node.id)
    if (!visuals)
      return
    for (const [kind, visual] of visuals) {
      const ui = ensureComponent(visual, options.cc?.UITransform, 'cc.UITransform')
      ui?.setContentSize?.(node.transform.width ?? 0, node.transform.height ?? 0)
      ui?.setAnchorPoint?.(node.transform.anchorX ?? 0, 1 - (node.transform.anchorY ?? 0))
      visual.setPosition?.(0, 0, 0)
      visual.setSiblingIndex?.(kind === 'sprite' ? 0 : 1)
    }
  }

  function sortChildren(parent: CocosCreatorNode): void {
    const children = [...(childNodes.get(parent.id) || [])]
      .sort((left, right) => (left.transform.zIndex ?? 0) - (right.transform.zIndex ?? 0))
    children.forEach((child, index) => (child.native as any)?.setSiblingIndex?.(index))
  }

  function registerNode(node: CocosCreatorNode): void {
    if (node.native && typeof node.native === 'object') {
      nodesByNative.set(node.native, node)
    }
    childNodes.set(node.id, childNodes.get(node.id) || new Set())
  }
}

interface CocosCreatorNode extends CocosHostNode {
  transform: CocosHostTransform
  native: unknown
}

function wrapNode(native: unknown, kind: string, name?: string): CocosCreatorNode {
  return {
    id: `${kind}:${Math.random().toString(36).slice(2)}`,
    kind,
    name,
    native,
    transform: {},
  }
}

function asCreatorNode(node: CocosHostNode): CocosCreatorNode {
  return node as CocosCreatorNode
}

function getComponent(native: any, component: unknown, componentName: string): any {
  return (component ? native?.getComponent?.(component) : undefined) || native?.getComponent?.(componentName)
}

function ensureComponent(native: any, component: unknown, componentName: string): any {
  const existing = getComponent(native, component, componentName)
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
    native?.setPosition?.(nextX, nextY, native?.getPosition?.()?.z ?? 0)
    if (!native?.setPosition) {
      native.x = nextX
      native.y = nextY
    }
  }
  if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
    const current = readNativeScale(native)
    const nextScaleX = transform.scaleX ?? current.x
    const nextScaleY = transform.scaleY ?? current.y
    native?.setScale?.(nextScaleX, nextScaleY, native?.getScale?.()?.z ?? 1)
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
  sprite.sizeMode = sizeMode.CUSTOM ?? sprite.sizeMode

  const frame = sprite.spriteFrame
  const slice = options.slice
  if (frame && slice && frame !== resource?.native) {
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
  if (style.align) {
    const alignments = (cc?.Label as any)?.HorizontalAlign || { LEFT: 0, CENTER: 1, RIGHT: 2 }
    component.horizontalAlign = alignments[style.align.toUpperCase()] ?? alignments.LEFT
  }
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
  const transform = getComponent(native, cc?.UITransform, 'cc.UITransform')
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
  options: { metadataKey?: string, metadataKeys?: readonly string[], includeInvisible?: boolean },
  parentMatrix: HitTestMatrix,
): { node: CocosHostNode, metadata?: Record<string, unknown> } | undefined {
  if (!options.includeInvisible && (root.native as any)?.active === false)
    return undefined
  const nodeMatrix = root.kind === 'stage' ? parentMatrix : multiplyMatrix(parentMatrix, creatorNodeMatrix(root))
  const children = [...(childNodes.get(root.id) || [])].reverse().sort((left, right) => {
    const lz = Number((left.native as any)?.priority || (left.native as any)?.zIndex || 0)
    const rz = Number((right.native as any)?.priority || (right.native as any)?.zIndex || 0)
    return rz - lz
  })
  for (const child of children) {
    const hit = hitTestNode(child, point, childNodes, metadataByNode, options, nodeMatrix)
    if (hit)
      return hit
  }
  const metadata = metadataByNode.get(root.id)
  if (options.metadataKey && metadata?.[options.metadataKey] === undefined)
    return undefined
  if (options.metadataKeys && !options.metadataKeys.some(key => metadata?.[key] !== undefined))
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
  const t = node.transform
  const anchorX = (t.anchorX ?? 0) * (t.width ?? 0)
  const anchorY = (t.anchorY ?? 0) * (t.height ?? 0)
  let matrix = translateMatrix(t.x ?? 0, t.y ?? 0)
  matrix = multiplyMatrix(matrix, translateMatrix(anchorX, anchorY))
  matrix = multiplyMatrix(matrix, rotateMatrix(t.rotation ?? 0))
  matrix = multiplyMatrix(matrix, scaleMatrix(t.scaleX ?? 1, t.scaleY ?? 1))
  return multiplyMatrix(matrix, translateMatrix(-anchorX, -anchorY))
}

function containsPoint(node: CocosCreatorNode, point: { x: number, y: number }, matrix: HitTestMatrix): boolean {
  const { width, height } = node.transform
  if (width === undefined || height === undefined)
    return false
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
  getContainerSize: () => CocosHostSize,
  listener: CocosHostInputListener,
): CocosHostDisposer {
  const disposers: CocosHostDisposer[] = []
  const eventType = cc?.Input?.EventType || {}
  const dispatch = (event: CocosHostInputEvent) => {
    void Promise.resolve().then(() => listener(event)).catch(error => console.error('Cocos input listener failed.', error))
  }
  const pointer = (phase: CocosHostInputEvent['phase']) => (event: unknown) => {
    const input = toPointerEvent(event, phase)
    const size = getContainerSize()
    const ui = getComponent(root.native, cc?.UITransform, 'cc.UITransform')
    if (ui?.convertToNodeSpaceAR) {
      const point = cc?.Vec3 ? new cc.Vec3(input.x, input.y, 0) : { x: input.x, y: input.y, z: 0 }
      const local = ui.convertToNodeSpaceAR(point)
      input.x = local.x + (ui.anchorX ?? 0.5) * size.width
      input.y = (1 - (ui.anchorY ?? 0.5)) * size.height - local.y
    }
    else {
      input.y = size.height - (input.y ?? 0)
    }
    dispatch(input)
  }
  if (cc?.input?.on && cc.input.off) {
    bindInputEvent(cc.input, eventType.TOUCH_START || 'touch-start', pointer('down'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_MOVE || 'touch-move', pointer('move'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_END || 'touch-end', pointer('up'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_CANCEL || 'touch-cancel', () => dispatch({ kind: 'focus', phase: 'blur' }), disposers)
    bindInputEvent(cc.input, eventType.KEY_DOWN || 'keydown', event => dispatch(toKeyboardEvent(event, 'down')), disposers)
    bindInputEvent(cc.input, eventType.KEY_UP || 'keyup', event => dispatch(toKeyboardEvent(event, 'up')), disposers)
  }
  else {
    const native = root.native as any
    bindNodeEvent(native, 'touch-start', pointer('down'), disposers)
    bindNodeEvent(native, 'touch-move', pointer('move'), disposers)
    bindNodeEvent(native, 'touch-end', pointer('up'), disposers)
  }
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
  const numericCode = Number(record?.keyCode)
  const codes: Record<number, string> = {
    13: 'Enter',
    27: 'Escape',
    32: 'Space',
    33: 'PageUp',
    34: 'PageDown',
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    16: 'ShiftLeft',
    17: 'ControlLeft',
    18: 'AltLeft',
  }
  const code = record?.code || codes[numericCode]
    || (numericCode >= 65 && numericCode <= 90 ? `Key${String.fromCharCode(numericCode)}` : undefined)
    || (numericCode >= 48 && numericCode <= 57 ? `Digit${String.fromCharCode(numericCode)}` : undefined)
  const key = record?.key ?? code ?? record?.keyCode
  return {
    kind: 'keyboard',
    phase,
    key: key === undefined ? undefined : String(key),
    code,
    repeat: Boolean(record?.repeat),
    metadata: { nativeEvent: event },
  }
}

function normalizePath(path: string, root?: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path) && !path.startsWith('cocos://'))
    return path
  const normalized = path.replace(/^cocos:\/\//, '')
  if (!root || normalized.startsWith('/'))
    return normalized
  const normalizedRoot = root.replace(/\/+$/, '')
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`) ? normalized : `${normalizedRoot}/${normalized}`
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
    .filter(([path]) => path === rootPath || path.startsWith(`${rootPath.replace(/\/+$/, '')}/`))
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
  if (Array.isArray(value))
    return value.map(item => clonePlain(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'resource' || key === 'native' ? item : clonePlain(item),
    ])) as T
  }
  return value
}
