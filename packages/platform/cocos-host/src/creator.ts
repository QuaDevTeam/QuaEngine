import type {
  CocosCaptureHost,
  CocosFontHost,
  CocosHost,
  CocosHostAudioHandle,
  CocosHostBoxStyle,
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
  CocosHostTextStyle,
  CocosHostTransform,
  CocosRuntimeHost,
  CocosStorageHost,
} from './index'
import { installCreatorLetterSpacing } from './creator-text'
import { CocosResourcePool } from './resources/pool'

export interface CocosCreatorHostOptions {
  rootNode: unknown
  runtime?: Partial<CocosRuntimeHost>
  cc?: CocosCreatorModule
  writableRoot?: string
  files?: CocosCreatorFileBridge
  resources?: CocosCreatorResourceBridge
  audio?: CocosCreatorAudioBridge
  video?: CocosCreatorVideoBridge
  spriteMaterial?: (sprite: any, resource: CocosHostResource | undefined, options: CocosHostSpriteOptions) => (() => void) | undefined
  fonts?: CocosCreatorFontBridge
  input?: CocosCreatorInputBridge
  capture?: CocosCaptureHost
  layout?: CocosCreatorLayoutBridge
}

/** Optional concrete decoder. All handles and decoded frames are transient. */
export interface CocosCreatorVideoBridge {
  project: (node: any, resource: CocosHostResource, options: CocosHostSpriteOptions) => void
  dispose: (node: any) => void
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
  gainAboveUnity?: boolean
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

export interface CocosCreatorFontBridge extends CocosFontHost {
  resolveFont?: (family: string) => unknown
}

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
  Graphics?: unknown
  Mask?: unknown
  Button?: unknown
  EditBox?: unknown
  Toggle?: unknown
  Slider?: unknown
  UITransform?: unknown
  UIOpacity?: unknown
  AudioSource?: unknown
  Canvas?: unknown
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
    isNative?: boolean
  }
  view?: {
    on?: (event: string, callback: () => void) => void
    off?: (event: string, callback: () => void) => void
    getVisibleSize?: () => CocosHostSize
    getFrameSize?: () => CocosHostSize
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
    ;
    (options.runtime?.warn || console.warn)(message, metadata)
  }
  const nodesByNative = new WeakMap<object, CocosCreatorNode>()
  const childNodes = new Map<string, Set<CocosCreatorNode>>()
  const parentNodes = new Map<string, CocosCreatorNode>()
  const materialDisposers = new Map<string, () => void>()
  const slicedFrames = new Map<string, any>()
  const visualNodes = new Map<string, Map<string, any>>()
  const solidColors = new Map<string, string>()
  const boxStyles = new Map<string, CocosHostBoxStyle>()
  const textDisposers = new Map<string, () => void>()
  const textStyles = new Map<string, { node: CocosCreatorNode, kind: string, style: CocosHostTextStyle }>()
  const metadataByNode = new Map<string, Record<string, unknown>>()
  const root = wrapNode(options.rootNode, 'root', 'root')
  registerNode(root)

  const fileBridge = options.files
  const resourceBridge = options.resources
  const resourcePool = new CocosResourcePool(resources, {
    retain: resourceBridge?.retainResource ? resource => resourceBridge.retainResource!(resource) : undefined,
    release: resourceBridge?.releaseResource ? resource => resourceBridge.releaseResource!(resource) : undefined,
  })
  const audioBridge = options.audio

  const nodeHost = {
    getRootNode: () => root,
    getNodeChildren: (node: CocosHostNode) => [...(childNodes.get(node.id) || [])],
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
      options.video?.dispose(current.native)
      for (const child of [...(childNodes.get(current.id) || [])]) {
        nodeHost.destroyNode(child)
      }
      const parent = parentNodes.get(current.id)
      if (parent) {
        nodeHost.removeChild(parent, current)
      }
      ;
      (current.native as any)?.destroy?.()
      childNodes.delete(current.id)
      parentNodes.delete(current.id)
      metadataByNode.delete(current.id)
      visualNodes.delete(current.id)
      solidColors.delete(current.id)
      boxStyles.delete(current.id)
      textDisposers.get(current.id)?.()
      textDisposers.delete(current.id)
      textStyles.delete(current.id)
      materialDisposers.get(current.id)?.()
      materialDisposers.delete(current.id)
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
      if (typeof parentNative?.layer === 'number')
        childNative.layer = parentNative.layer
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
      else
        if (Array.isArray(parentNative?.children))
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
      solidColors.delete(node.id)
      boxStyles.delete(node.id)
      textDisposers.get(node.id)?.()
      textDisposers.delete(node.id)
      textStyles.delete(node.id)
      materialDisposers.get(node.id)?.()
      materialDisposers.delete(node.id)
      native?.removeAllChildren?.()
    },
    setNodeVisible(node: CocosHostNode, visible: boolean) {
      ;
      (asCreatorNode(node).native as any).active = visible
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
      if (current.transform.clip) {
        const mask = ensureComponent(current.native, options.cc?.Mask, 'cc.Mask')
        if (mask) {
          const clip = { x: 0, y: 0, width: current.transform.width ?? 0, height: current.transform.height ?? 0, ...current.transform.clip }
          const full = clip.x === 0 && clip.y === 0 && clip.width === current.transform.width && clip.height === current.transform.height
          mask.type = full ? (options.cc?.Mask as any)?.Type?.GRAPHICS_RECT ?? 0 : (options.cc?.Mask as any)?.Type?.GRAPHICS_STENCIL ?? 2
          mask.enabled = true
          if (!full && mask.subComp?.rect) {
            mask.subComp.clear()
            mask.subComp.rect(clip.x - (current.transform.anchorX ?? 0) * (current.transform.width ?? 0), (1 - (current.transform.anchorY ?? 0)) * -(current.transform.height ?? 0) + (current.transform.height ?? 0) - clip.y - clip.height, clip.width, clip.height)
            mask.subComp.fill()
          }
        }
        else {
          warn('Cocos Creator clip projection requires cc.Mask.')
        }
      }
    },
    measureText(text: string, style: CocosHostTextStyle, maxWidth: number) {
      const node = nodeHost.createNode('text-measure', { parent: root })
      const native = asCreatorNode(node).native as any
      const label = ensureComponent(native, options.cc?.Label, 'cc.Label')
      if (!label?.updateRenderData) {
        nodeHost.destroyNode(node)
        return undefined
      }
      const ui = ensureComponent(native, options.cc?.UITransform, 'cc.UITransform')
      const font = options.fonts?.resolveFont?.(style.fontFamily || 'Noto Sans')
      applyTextStyle(options.cc, label, style)
      if (font) {
        label.font = font
        label.useSystemFont = false
      }
      ui.setContentSize(maxWidth, 1)
      label.overflow = (options.cc?.Label as any).Overflow.RESIZE_HEIGHT
      label.string = text || ' '
      const dispose = installCreatorLetterSpacing(label, style.letterSpacing ?? 0)
      label.updateRenderData(true)
      const result = { width: ui.width, height: ui.height }
      dispose?.()
      nodeHost.destroyNode(node)
      return result
    },
    setNodeText(node: CocosHostNode, text: string, style: CocosHostTextStyle = {}) {
      const native = asCreatorNode(node).native as any
      const label = presentationComponent(asCreatorNode(node), 'label', options.cc?.Label, 'cc.Label')
      if (label) {
        textStyles.set(node.id, { node: asCreatorNode(node), kind: 'label', style })
        label.string = text
        applyTextStyle(options.cc, label, style)
        const font = options.fonts?.resolveFont?.(style.fontFamily || 'Noto Sans')
        if (font) {
          label.font = font
          label.useSystemFont = false
        }
        updatePresentation(asCreatorNode(node))
        textDisposers.get(node.id)?.()
        textDisposers.delete(node.id)
        const dispose = installCreatorLetterSpacing(label, style.letterSpacing ?? 0)
        if (dispose)
          textDisposers.set(node.id, dispose)
      }
      else {
        native.text = text
      }
    },
    setNodeRichText(node: CocosHostNode, markup: string, style: CocosHostTextStyle = {}) {
      const native = asCreatorNode(node).native as any
      const richText = presentationComponent(asCreatorNode(node), 'rich-text', options.cc?.RichText, 'cc.RichText')
      if (richText) {
        textStyles.set(node.id, { node: asCreatorNode(node), kind: 'rich-text', style })
        richText.string = markup
        applyTextStyle(options.cc, richText, style)
        const font = options.fonts?.resolveFont?.(style.fontFamily || 'Noto Sans')
        if (font)
          richText.font = font
        updatePresentation(asCreatorNode(node))
      }
      else {
        native.richText = markup
      }
    },
    setNodeSprite(node: CocosHostNode, resource?: CocosHostResource, spriteOptions: CocosHostSpriteOptions = {}) {
      const native = asCreatorNode(node).native as any
      if (spriteOptions.mode === 'video' && resource && options.video) {
        options.video.project(native, resource, spriteOptions)
        return
      }
      options.video?.dispose(native)
      const sprite = presentationComponent(asCreatorNode(node), 'sprite', options.cc?.Sprite, 'cc.Sprite')
      if (sprite) {
        const previousMaterial = materialDisposers.get(node.id)
        materialDisposers.delete(node.id)
        // Native Creator may not retain the builtin render-texture variant.
        // Install the imported projection material before assigning its frame.
        const dispose = options.spriteMaterial?.(sprite, resource, spriteOptions)
        previousMaterial?.()
        if (dispose)
          materialDisposers.set(node.id, dispose)
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
        // Assigning a SpriteFrame can resize the presentation child to the
        // imported texture. Restore logical bounds, including downsampled RTs.
        updatePresentation(asCreatorNode(node))
      }
      else {
        native.sprite = resource?.native
      }
      if (spriteOptions.tint)
        (sprite || native).color = parseCocosColor(options.cc, spriteOptions.tint)
      if (spriteOptions.opacity !== undefined)
        applyNodeOpacity(options.cc, native, spriteOptions.opacity)
      if (spriteOptions.mask || spriteOptions.states || (!options.spriteMaterial && (spriteOptions.lighting || spriteOptions.filter || spriteOptions.composition || (spriteOptions.blendMode && spriteOptions.blendMode !== 'normal'))))
        warn('Cocos Creator advanced sprite options require a custom material/control implementation; projection metadata is retained only.')
      native.spriteOptions = clonePlain(spriteOptions)
    },
    setNodeControl(node: CocosHostNode, control: CocosHostControlOptions) {
      const native = asCreatorNode(node).native as any
      applyControlComponent(options.cc, native, control)
      native.control = clonePlain(control)
    },
    setNodeColor(node: CocosHostNode, color?: string) {
      const current = asCreatorNode(node)
      const native = current.native as any
      native.color = parseCocosColor(options.cc, color)
      const spriteNode = visualNodes.get(node.id)?.get('sprite')
      const sprite = getComponent(spriteNode || native, options.cc?.Sprite, 'cc.Sprite')
      if (sprite) {
        sprite.color = parseCocosColor(options.cc, color || '#ffffff')
        return
      }
      if (!color) {
        solidColors.delete(node.id)
        const visual = visualNodes.get(node.id)?.get('color')
        if (visual)
          visual.active = false
        return
      }
      solidColors.set(node.id, color)
      const graphics = presentationComponent(current, 'color', options.cc?.Graphics, 'cc.Graphics')
      if (!graphics)
        warn('Cocos Creator solid color projection requires cc.Graphics; color metadata is retained only.')
      updatePresentation(current)
    },
    setNodeBoxStyle(node: CocosHostNode, style: CocosHostBoxStyle) {
      boxStyles.set(node.id, { ...style })
      presentationComponent(asCreatorNode(node), 'box', options.cc?.Graphics, 'cc.Graphics')
      updatePresentation(asCreatorNode(node))
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
      setTargetFrameRate: options.runtime?.setTargetFrameRate,
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
          return fileBridge.loadBytes(source)
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
        return (await resourcePool.acquire(id, kind, async () => {
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
          return resource
        }))!
      },
      async loadResource(kind: CocosHostResourceKind, source, resourceOptions = {}) {
        const id = resourceOptions.id || `${kind}:${source}`
        return resourcePool.acquire(id, kind, async () => resourceBridge?.loadResource?.(kind, source, {
          id,
          mimeType: resourceOptions.mimeType,
          metadata: resourceOptions.metadata,
          cc: options.cc,
        }))
      },
      retainResource(resource) {
        resourcePool.retain(resource)
      },
      releaseResource(resource) {
        resourcePool.release(resource)
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
    fonts: options.fonts
      ? {
          async registerFontFace(resource, face) {
            await options.fonts!.registerFontFace(resource, face)
            refreshFonts()
          },
          async unregisterFontFace(id) {
            await options.fonts!.unregisterFontFace(id)
            refreshFonts()
          },
        }
      : undefined,
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
      audioGainAboveUnity: audioBridge?.gainAboveUnity === true,
      video: Boolean(options.video),
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

  function refreshFonts(): void {
    for (const { node, kind, style } of textStyles.values()) {
      const visual = visualNodes.get(node.id)?.get(kind) || node.native
      const component = getComponent(visual, kind === 'label' ? options.cc?.Label : options.cc?.RichText, kind === 'label' ? 'cc.Label' : 'cc.RichText')
      const font = options.fonts?.resolveFont?.(style.fontFamily || 'Noto Sans')
      if (component) {
        textDisposers.get(node.id)?.()
        textDisposers.delete(node.id)
        component.font = font ?? null
        if (kind === 'label')
          component.useSystemFont = !font
        const dispose = kind === 'label' && installCreatorLetterSpacing(component, style.letterSpacing ?? 0)
        if (dispose)
          textDisposers.set(node.id, dispose)
      }
    }
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
      if (typeof (node.native as any)?.layer === 'number')
        visual.layer = (node.native as any).layer
        ;
      (node.native as any).addChild?.(visual)
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
      const padding = (kind === 'label' || kind === 'rich-text') ? textStyles.get(node.id)?.style.padding : undefined
      if (padding) {
        ui?.setContentSize?.(Math.max(0, (node.transform.width ?? 0) - padding.left - padding.right), Math.max(0, (node.transform.height ?? 0) - padding.top - padding.bottom))
        visual.setPosition?.(padding.left - (node.transform.anchorX ?? 0) * (padding.left + padding.right), -padding.top + (node.transform.anchorY ?? 0) * (padding.top + padding.bottom), 0)
      }
      if (kind === 'box') {
        const style = boxStyles.get(node.id)
        const graphics = getComponent(visual, options.cc?.Graphics, 'cc.Graphics')
        if (style && graphics) {
          const width = node.transform.width ?? 0
          const height = node.transform.height ?? 0
          const x = -(node.transform.anchorX ?? 0) * width
          const y = -((1 - (node.transform.anchorY ?? 0)) * height)
          graphics.clear()
          if ((style.shape === 'chevron-down' || style.shape === 'chevron-up') && graphics.moveTo && graphics.lineTo && graphics.stroke) {
            graphics.strokeColor = parseCocosColor(options.cc, style.backgroundColor ?? style.borderColor ?? '#ffffff')
            graphics.lineWidth = Math.min(2, height / 3)
            const up = style.shape === 'chevron-up'
            graphics.moveTo(x + 1, y + (up ? 1 : height - 1))
            graphics.lineTo(x + width / 2, y + (up ? height - 1 : 1))
            graphics.lineTo(x + width - 1, y + (up ? 1 : height - 1))
            graphics.stroke()
            continue
          }
          if (style.boxShadow && !style.boxShadow.inset) {
            const shadow = style.boxShadow
            const color = parseCocosColor(undefined, shadow.color) as any
            const steps = shadow.blurRadius > 0 ? 24 : 1
            for (let step = steps; step >= 1; step--) {
              const extent = shadow.spreadRadius + shadow.blurRadius * step / steps
              graphics.fillColor = parseCocosColor(options.cc, `rgba(${color.r},${color.g},${color.b},${color.a / 255 / steps})`)
              const sx = x + shadow.offsetX - extent
              const sy = y - shadow.offsetY - extent
              if (graphics.roundRect)
                graphics.roundRect(sx, sy, width + extent * 2, height + extent * 2, Math.max(0, (style.borderRadius ?? 0) + extent))
              else
                graphics.rect(sx, sy, width + extent * 2, height + extent * 2)
              graphics.fill()
            }
          }
          if (style.backgroundColor) {
            graphics.fillColor = parseCocosColor(options.cc, style.backgroundColor)
            if (style.borderRadius && graphics.roundRect)
              graphics.roundRect(x, y, width, height, style.borderRadius)
            else
              graphics.rect(x, y, width, height)
            graphics.fill()
          }
          if (style.backgroundGradient?.kind === 'linear') {
            const gradient = style.backgroundGradient
            const vertical = Math.abs(Math.cos((gradient.angleDegrees ?? 180) * Math.PI / 180)) > 0.99
            const length = vertical ? height : width
            const reversed = vertical ? (gradient.angleDegrees ?? 180) === 0 : (gradient.angleDegrees ?? 90) === 270
            for (let offset = 0; offset < length; offset += 2) {
              let position = (offset + 1) / length
              if (reversed)
                position = 1 - position
              const upper = gradient.stops.findIndex(stop => stop.position >= position)
              const right = gradient.stops[upper < 0 ? gradient.stops.length - 1 : upper]
              const left = gradient.stops[Math.max(0, upper < 0 ? gradient.stops.length - 1 : upper - 1)]
              if (!left || !right)
                continue
              const t = left === right ? 0 : Math.max(0, Math.min(1, (position - left.position) / (right.position - left.position)))
              const a = parseCocosColor(undefined, left.color) as any
              const b = parseCocosColor(undefined, right.color) as any
              graphics.fillColor = parseCocosColor(options.cc, `rgba(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(a.g + (b.g - a.g) * t)},${Math.round(a.b + (b.b - a.b) * t)},${(a.a + (b.a - a.a) * t) / 255})`)
              if (vertical)
                graphics.rect(x, y + height - offset - Math.min(2, length - offset), width, Math.min(2, length - offset))
              else
                graphics.rect(x + offset, y, Math.min(2, length - offset), height)
              graphics.fill()
            }
          }
          const roundedBorder = style.borderRadius && style.borderWidth && style.borderColor
            && graphics.roundRect && graphics.stroke
            && !['Top', 'Right', 'Bottom', 'Left'].some(side => style[`border${side}Width` as keyof CocosHostBoxStyle] !== undefined || style[`border${side}Color` as keyof CocosHostBoxStyle] !== undefined)
          if (roundedBorder) {
            const inset = Math.min(style.borderWidth!, width / 2, height / 2) / 2
            graphics.strokeColor = parseCocosColor(options.cc, style.borderColor)
            graphics.lineWidth = inset * 2
            graphics.roundRect(x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(0, Math.min(style.borderRadius!, width / 2, height / 2) - inset))
            graphics.stroke()
          }
          for (const [side, rx, ry, rw, rh] of roundedBorder
            ? []
            : [
                ['Top', x, y + height - (style.borderTopWidth ?? style.borderWidth ?? 0), width, style.borderTopWidth ?? style.borderWidth ?? 0],
                ['Bottom', x, y, width, style.borderBottomWidth ?? style.borderWidth ?? 0],
                ['Left', x, y, style.borderLeftWidth ?? style.borderWidth ?? 0, height],
                ['Right', x + width - (style.borderRightWidth ?? style.borderWidth ?? 0), y, style.borderRightWidth ?? style.borderWidth ?? 0, height],
              ] as [string, number, number, number, number][]) {
            const color = style[`border${side}Color` as keyof CocosHostBoxStyle] || style.borderColor
            if (rw > 0 && rh > 0 && color) {
              graphics.fillColor = parseCocosColor(options.cc, color as string)
              graphics.rect(rx, ry, rw, rh)
              graphics.fill()
            }
          }
        }
      }
      if (kind === 'color') {
        const color = solidColors.get(node.id)
        visual.active = Boolean(color)
        const graphics = getComponent(visual, options.cc?.Graphics, 'cc.Graphics')
        if (graphics && color) {
          const width = node.transform.width ?? 0
          const height = node.transform.height ?? 0
          graphics.clear()
          graphics.fillColor = parseCocosColor(options.cc, color)
          graphics.rect(-(node.transform.anchorX ?? 0) * width || 0, -((1 - (node.transform.anchorY ?? 0)) * height), width, height)
          graphics.fill()
        }
      }
    }
    sortChildren(node)
  }

  function sortChildren(parent: CocosCreatorNode): void {
    const children = [...(childNodes.get(parent.id) || [])]
      .sort((left, right) => (left.transform.zIndex ?? 0) - (right.transform.zIndex ?? 0))
    const visuals = [...(visualNodes.get(parent.id)?.entries() || [])].sort(([a], [b]) => {
      const order = ['color', 'box', 'sprite', 'label', 'rich-text']
      return order.indexOf(a) - order.indexOf(b)
    })
    visuals.forEach(([, visual], index) => visual.setSiblingIndex?.(index))
    children.forEach((child, index) => (child.native as any)?.setSiblingIndex?.(visuals.length + index))
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
  else
    if (options.mode === 'tiled') {
      sprite.type = spriteType.TILED ?? spriteType.tiled ?? sprite.type
    }
    else
      if (options.mode === 'sprite' || !options.mode) {
        sprite.type = spriteType.SIMPLE ?? spriteType.simple ?? sprite.type
      }

  const sizeMode = (cc?.Sprite as any)?.SizeMode || {}
  sprite.sizeMode = sizeMode.CUSTOM ?? sprite.sizeMode
  // Creator auto-trims transparent SpriteFrames. Keep the authored canvas
  // when fitting into logical bounds, matching Web images and sprite layers.
  sprite.trim = resource?.metadata?.renderTexture === true

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

function applyTextStyle(cc: CocosCreatorModule | undefined, component: any, style: CocosHostTextStyle): void {
  if (style.fontSize !== undefined)
    component.fontSize = style.fontSize
  if (style.lineHeight !== undefined)
    component.lineHeight = style.lineHeight
  if (style.color)
    component.color = parseCocosColor(cc, style.color)
  component.verticalAlign = ((cc?.Label as any)?.VerticalAlign || { TOP: 0, CENTER: 1, BOTTOM: 2 })[(style.verticalAlign || 'top').toUpperCase()]
  if (style.letterSpacing !== undefined)
    component.spacingX = style.letterSpacing
  component.enableWrapText = true
  component.isBold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600
  if ((cc?.Label as any)?.Overflow)
    component.overflow = (cc?.Label as any).Overflow.CLAMP
  if (style.align) {
    const alignments = (cc?.Label as any)?.HorizontalAlign || { LEFT: 0, CENTER: 1, RIGHT: 2 }
    component.horizontalAlign = alignments[style.align.toUpperCase()] ?? alignments.LEFT
  }
}

function parseCocosColor(cc: CocosCreatorModule | undefined, color?: string): unknown {
  if (!color)
    return undefined
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(color)
  if (rgba) {
    const [r, g, b] = rgba.slice(1, 4).map(Number)
    const a = rgba[4] === undefined ? 255 : Math.round(Number(rgba[4]) * 255)
    return cc?.Color ? new cc.Color(r, g, b, a) : { r, g, b, a }
  }
  if (color === 'transparent')
    return cc?.Color ? new cc.Color(0, 0, 0, 0) : { r: 0, g: 0, b: 0, a: 0 }
  if (/^#[0-9a-f]{3,4}$/i.test(color))
    color = `#${color.slice(1).split('').map(c => c + c).join('')}`
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
  if (root.transform.clip && !containsClip({ x: 0, y: 0, width: root.transform.width ?? 0, height: root.transform.height ?? 0, ...root.transform.clip }, point, nodeMatrix))
    return undefined
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

function containsClip(clip: CocosHostRect, point: { x: number, y: number }, matrix: HitTestMatrix): boolean {
  const inverse = invertMatrix(matrix)
  if (!inverse)
    return false
  const local = transformPoint(inverse, point)
  return local.x >= clip.x && local.x <= clip.x + clip.width && local.y >= clip.y && local.y <= clip.y + clip.height
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
  const pointer = (phase: CocosHostInputEvent['phase']) => (event: unknown, metadata?: Record<string, unknown>) => {
    const input = toPointerEvent(event, phase)
    const size = getContainerSize()
    const ui = getComponent(root.native, cc?.UITransform, 'cc.UITransform')
    if (ui?.convertToNodeSpaceAR) {
      // getUILocation is in the visible view, not world coordinates. A fixed
      // height Canvas can have a camera center outside visibleSize / 2.
      const camera = getComponent(root.native, cc?.Canvas, 'cc.Canvas')?.cameraComponent
      const visible = cc?.view?.getVisibleSize?.() || size
      const worldX = input.x! + (camera ? camera.node.worldPosition.x - visible.width / 2 : 0)
      const worldY = input.y! + (camera ? camera.node.worldPosition.y - visible.height / 2 : 0)
      const point = cc?.Vec3 ? new cc.Vec3(worldX, worldY, 0) : { x: worldX, y: worldY, z: 0 }
      const local = ui.convertToNodeSpaceAR(point)
      input.x = local.x + (ui.anchorX ?? 0.5) * size.width
      input.y = (1 - (ui.anchorY ?? 0.5)) * size.height - local.y
    }
    else {
      input.y = size.height - (input.y ?? 0)
    }
    if (metadata)
      input.metadata = metadata
    dispatch(input)
  }
  if (cc?.input?.on && cc.input.off) {
    bindInputEvent(cc.input, eventType.TOUCH_START || 'touch-start', pointer('down'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_MOVE || 'touch-move', pointer('move'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_END || 'touch-end', pointer('up'), disposers)
    bindInputEvent(cc.input, eventType.TOUCH_CANCEL || 'touch-cancel', () => dispatch({ kind: 'focus', phase: 'blur' }), disposers)
    // Creator synthesizes touch down/up from a mouse. Bind mouse only for
    // unpressed hover and wheel, so clicks still enter the pipeline once.
    if (eventType.MOUSE_MOVE)
      bindInputEvent(cc.input, eventType.MOUSE_MOVE, pointer('move'), disposers)
    if (eventType.MOUSE_WHEEL) {
      bindInputEvent(cc.input, eventType.MOUSE_WHEEL, (event) => {
        const frame = cc.view?.getFrameSize?.()
        const size = getContainerSize()
        // Creator Web multiplies DOM wheel pixels by five; native already
        // standardizes wheel ticks. Return deltas in the same container units
        // as pointer positions before the renderer applies logical stage scale.
        const sensitivity = cc.sys?.isNative === false ? 5 : 1
        pointer('wheel')(event, {
          deltaY: -Number((event as any)?.getScrollY?.() || 0) / sensitivity * (frame?.height ? size.height / frame.height : 1),
          deltaX: Number((event as any)?.getScrollX?.() || 0) / sensitivity * (frame?.width ? size.width / frame.width : 1),
        })
      }, disposers)
    }
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
