import type {
  CocosAssetHost,
  CocosAudioHost,
  CocosCaptureHost,
  CocosHost,
  CocosHostAudioHandle,
  CocosHostControlOptions,
  CocosHostFileInfo,
  CocosHostFontFaceOptions,
  CocosHostInputEvent,
  CocosHostInputListener,
  CocosHostNode,
  CocosHostResource,
  CocosHostResourceKind,
  CocosHostSpriteOptions,
  CocosHostTransform,
} from './index'

export interface FakeCocosNode extends CocosHostNode {
  parent?: FakeCocosNode
  children: FakeCocosNode[]
  visible: boolean
  transform: CocosHostTransform
  text?: string
  richText?: string
  sprite?: CocosHostResource
  spriteOptions?: CocosHostSpriteOptions
  control?: CocosHostControlOptions
  metadata: Record<string, unknown>
  destroyed: boolean
}

export interface FakeCocosHostOptions {
  containerSize?: { width: number, height: number }
  devicePixelRatio?: number
  safeAreaInsets?: Partial<{ top: number, right: number, bottom: number, left: number }>
  now?: () => number
  files?: Record<string, Uint8Array | string>
}

export interface FakeCocosHost extends CocosHost {
  root: FakeCocosNode
  nodesById: Map<string, FakeCocosNode>
  resourcesById: Map<string, CocosHostResource>
  resourceReleaseCounts: Map<string, number>
  audioHandlesById: Map<string, FakeCocosAudioHandle>
  audioBusVolumes: Map<string, number>
  audioBusEq: Map<string, readonly unknown[]>
  fontFacesById: Map<string, { resource: CocosHostResource, options: CocosHostFontFaceOptions }>
  files: Map<string, Uint8Array>
  inputEvents: CocosHostInputEvent[]
  emitInput: (event: CocosHostInputEvent) => Promise<void>
}

export interface FakeCocosAudioHandle extends CocosHostAudioHandle {
  readonly playing: boolean
  readonly volume: number
  readonly loop: boolean
  readonly playbackRate: number
  readonly positionMs: number
  readonly eqBands: readonly unknown[]
  readonly seekCalls: readonly number[]
  readonly endedListenerCount: number
  readonly disposed: boolean
  readonly resource: CocosHostResource
  emitEnded: () => void
}

let idCounter = 0

export function createFakeCocosHost(options: FakeCocosHostOptions = {}): FakeCocosHost {
  const files = new Map<string, Uint8Array>()
  for (const [path, value] of Object.entries(options.files || {})) {
    files.set(normalizePath(path), typeof value === 'string' ? utf8ToBytes(value) : new Uint8Array(value))
  }
  const nodesById = new Map<string, FakeCocosNode>()
  const resourcesById = new Map<string, CocosHostResource>()
  const resourceReleaseCounts = new Map<string, number>()
  const audioHandlesById = new Map<string, FakeCocosAudioHandle>()
  const audioBusVolumes = new Map<string, number>()
  const audioBusEq = new Map<string, readonly unknown[]>()
  const fontFacesById = new Map<string, { resource: CocosHostResource, options: CocosHostFontFaceOptions }>()
  const inputListeners = new Set<CocosHostInputListener>()
  const inputEvents: CocosHostInputEvent[] = []
  const now = options.now || Date.now
  const root = createNodeRecord('root', 'root')
  nodesById.set(root.id, root)

  const nodeHost = {
    getRootNode: () => root,
    createNode(kind: string, nodeOptions: { name?: string, parent?: CocosHostNode } = {}) {
      const node = createNodeRecord(kind, nodeOptions.name)
      nodesById.set(node.id, node)
      if (nodeOptions.parent) {
        nodeHost.appendChild(nodeOptions.parent, node)
      }
      return node
    },
    destroyNode(node: CocosHostNode) {
      const current = asFakeNode(node)
      current.destroyed = true
      if (current.parent) {
        nodeHost.removeChild(current.parent, current)
      }
      for (const child of [...current.children]) {
        nodeHost.destroyNode(child)
      }
      nodesById.delete(current.id)
    },
    appendChild(parent: CocosHostNode, child: CocosHostNode) {
      const parentNode = asFakeNode(parent)
      const childNode = asFakeNode(child)
      if (childNode.parent) {
        nodeHost.removeChild(childNode.parent, childNode)
      }
      childNode.parent = parentNode
      parentNode.children.push(childNode)
    },
    removeChild(parent: CocosHostNode, child: CocosHostNode) {
      const parentNode = asFakeNode(parent)
      const childNode = asFakeNode(child)
      parentNode.children = parentNode.children.filter(candidate => candidate.id !== childNode.id)
      if (childNode.parent?.id === parentNode.id) {
        childNode.parent = undefined
      }
    },
    clearChildren(node: CocosHostNode) {
      for (const child of [...asFakeNode(node).children]) {
        nodeHost.destroyNode(child)
      }
    },
    setNodeVisible(node: CocosHostNode, visible: boolean) {
      asFakeNode(node).visible = visible
    },
    setNodeTransform(node: CocosHostNode, transform: CocosHostTransform) {
      asFakeNode(node).transform = { ...asFakeNode(node).transform, ...transform }
    },
    setNodeText(node: CocosHostNode, text: string) {
      asFakeNode(node).text = text
    },
    setNodeRichText(node: CocosHostNode, markup: string) {
      asFakeNode(node).richText = markup
    },
    setNodeSprite(node: CocosHostNode, resource?: CocosHostResource, spriteOptions: CocosHostSpriteOptions = {}) {
      asFakeNode(node).sprite = resource
      asFakeNode(node).spriteOptions = { ...spriteOptions }
    },
    setNodeControl(node: CocosHostNode, control: CocosHostControlOptions) {
      asFakeNode(node).control = {
        ...control,
        options: control.options ? control.options.map(option => ({ ...option })) : undefined,
        metadata: control.metadata ? { ...control.metadata } : undefined,
      }
    },
    setNodeMetadata(node: CocosHostNode, metadata: Record<string, unknown>) {
      asFakeNode(node).metadata = { ...metadata }
    },
    getNodeMetadata(node: CocosHostNode) {
      return { ...asFakeNode(node).metadata }
    },
    hitTest(rootNode: CocosHostNode, point: { x: number, y: number }, hitOptions: { metadataKey?: string, includeInvisible?: boolean } = {}) {
      return hitTestNode(asFakeNode(rootNode), point, hitOptions, identityMatrix())
    },
    getContainerSize: () => options.containerSize || { width: 1920, height: 1080 },
    getDevicePixelRatio: () => options.devicePixelRatio || 1,
    getSafeAreaInsets: () => options.safeAreaInsets || {},
  }

  const assetHost: CocosAssetHost = {
    async loadBytes(source) {
      const bytes = files.get(normalizePath(source))
      if (!bytes) {
        throw new Error(`Fake Cocos file not found: ${source}`)
      }
      return new Uint8Array(bytes)
    },
    async writeBytes(path, bytes) {
      files.set(normalizePath(path), new Uint8Array(bytes))
    },
    async readBytes(path) {
      const bytes = files.get(normalizePath(path))
      return bytes ? new Uint8Array(bytes) : undefined
    },
    async deleteFile(path) {
      files.delete(normalizePath(path))
    },
    async listFiles(rootPath) {
      return listFiles(files, rootPath)
    },
    async createResource(kind: CocosHostResourceKind, data, resourceOptions = {}) {
      const id = resourceOptions.id || nextId(`resource:${kind}`)
      const existing = resourcesById.get(id)
      if (existing)
        return existing
      const resource: CocosHostResource = {
        id,
        kind,
        source: resourceOptions.source,
        mimeType: resourceOptions.mimeType,
        width: Number(resourceOptions.metadata?.width) || undefined,
        height: Number(resourceOptions.metadata?.height) || undefined,
        duration: Number(resourceOptions.metadata?.duration) || undefined,
        native: new Uint8Array(data),
      }
      resourcesById.set(id, resource)
      return resource
    },
    async loadResource(kind: CocosHostResourceKind, source, resourceOptions = {}) {
      const id = resourceOptions.id || `${kind}:${source}`
      const existing = resourcesById.get(id)
      if (existing)
        return existing
      const resource: CocosHostResource = {
        id,
        kind,
        source,
        mimeType: resourceOptions.mimeType,
        width: Number(resourceOptions.metadata?.width) || undefined,
        height: Number(resourceOptions.metadata?.height) || undefined,
        duration: Number(resourceOptions.metadata?.duration) || undefined,
        native: { source, kind },
      }
      resourcesById.set(id, resource)
      return resource
    },
    retainResource(resource) {
      if (!resourcesById.has(resource.id)) {
        resourcesById.set(resource.id, resource)
      }
    },
    releaseResource(resource) {
      resourceReleaseCounts.set(resource.id, (resourceReleaseCounts.get(resource.id) || 0) + 1)
      resourcesById.delete(resource.id)
    },
  }

  const storageHost = {
    writeText: async (path: string, value: string) => {
      files.set(normalizePath(path), utf8ToBytes(value))
    },
    readText: async (path: string) => {
      const bytes = files.get(normalizePath(path))
      return bytes ? bytesToUtf8(bytes) : undefined
    },
    writeBytes: assetHost.writeBytes,
    readBytes: assetHost.readBytes,
    delete: async (path: string) => {
      files.delete(normalizePath(path))
    },
    list: async (rootPath: string) => listFiles(files, rootPath),
    ensureDir: async () => {},
    move: async (from: string, to: string) => {
      const source = normalizePath(from)
      const target = normalizePath(to)
      const bytes = files.get(source)
      if (bytes) {
        files.set(target, bytes)
        files.delete(source)
      }
    },
  }

  const audioHost: CocosAudioHost = {
    async createAudioHandle(resource, handleOptions = {}) {
      let playing = false
      let volume = handleOptions.volume ?? 1
      let loop = handleOptions.loop ?? false
      let playbackRate = handleOptions.playbackRate ?? 1
      let positionMs = 0
      let eqBands: readonly unknown[] = []
      let disposed = false
      const seekCalls: number[] = []
      const endedListeners = new Set<() => void>()
      const handle = {
        id: handleOptions.id || nextId('audio'),
        play: () => {
          disposed = false
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
        setPlaybackRate: (next: number) => {
          playbackRate = next
        },
        setEq: (bands: readonly unknown[]) => {
          eqBands = [...bands]
        },
        seek: (next: number) => {
          positionMs = next
          seekCalls.push(next)
        },
        getPosition: () => positionMs,
        onEnded: (listener: () => void) => {
          endedListeners.add(listener)
          return () => endedListeners.delete(listener)
        },
        emitEnded: () => {
          playing = false
          for (const listener of endedListeners) {
            listener()
          }
        },
        dispose: () => {
          playing = false
          disposed = true
          endedListeners.clear()
        },
      } as unknown as FakeCocosAudioHandle
      Object.defineProperties(handle, {
        playing: { get: () => playing },
        volume: { get: () => volume },
        loop: { get: () => loop },
        playbackRate: { get: () => playbackRate },
        positionMs: { get: () => positionMs },
        eqBands: { get: () => eqBands },
        seekCalls: { get: () => [...seekCalls] },
        endedListenerCount: { get: () => endedListeners.size },
        disposed: { get: () => disposed },
        resource: { get: () => resource },
      })
      audioHandlesById.set(handle.id, handle)
      return handle
    },
    setBusVolume(bus, volume) {
      audioBusVolumes.set(bus, volume)
    },
    setBusEq(bus, bands) {
      audioBusEq.set(bus, bands)
    },
  }

  const captureHost: CocosCaptureHost = {
    async captureNode(_node, captureOptions = {}) {
      return {
        bytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: captureOptions.mimeType || 'image/png',
        width: options.containerSize?.width,
        height: options.containerSize?.height,
        capturedAt: now(),
      }
    },
  }

  const timeouts = new Map<number, ReturnType<typeof setTimeout>>()
  const frames = new Map<number, ReturnType<typeof setTimeout>>()

  const host: FakeCocosHost = {
    root,
    nodesById,
    resourcesById,
    resourceReleaseCounts,
    audioHandlesById,
    audioBusVolumes,
    audioBusEq,
    fontFacesById,
    files,
    inputEvents,
    async emitInput(event) {
      inputEvents.push(event)
      for (const listener of inputListeners) {
        await listener(event)
      }
    },
    runtime: {
      now,
    },
    nodes: nodeHost,
    assets: assetHost,
    storage: storageHost,
    audio: audioHost,
    fonts: {
      registerFontFace(resource, fontOptions) {
        fontFacesById.set(fontOptions.id, {
          resource,
          options: {
            ...fontOptions,
            metadata: fontOptions.metadata ? { ...fontOptions.metadata } : undefined,
          },
        })
      },
      unregisterFontFace(id) {
        fontFacesById.delete(id)
      },
    },
    input: {
      onInput(listener) {
        inputListeners.add(listener)
        return () => inputListeners.delete(listener)
      },
    },
    capture: captureHost,
    scheduler: {
      requestFrame(callback) {
        const id = nextNumericId()
        frames.set(id, setTimeout(() => callback(now()), 16))
        return id
      },
      cancelFrame(handle) {
        const frame = frames.get(handle)
        if (frame)
          clearTimeout(frame)
        frames.delete(handle)
      },
      setTimeout(callback, ms) {
        const id = nextNumericId()
        timeouts.set(id, setTimeout(callback, ms))
        return id
      },
      clearTimeout(handle) {
        const timeout = timeouts.get(handle)
        if (timeout)
          clearTimeout(timeout)
        timeouts.delete(handle)
      },
    },
    capabilities: {
      localFiles: true,
      writableStorage: true,
      input: true,
      audioEq: true,
      audioPlaybackRate: true,
      capture: true,
      fonts: true,
      nativeAssets: true,
    },
  }

  return host
}

function createNodeRecord(kind: string, name?: string): FakeCocosNode {
  return {
    id: nextId(kind),
    kind,
    name,
    children: [],
    visible: true,
    transform: {},
    metadata: {},
    destroyed: false,
  }
}

function asFakeNode(node: CocosHostNode): FakeCocosNode {
  return node as FakeCocosNode
}

function hitTestNode(
  root: FakeCocosNode,
  point: { x: number, y: number },
  options: { metadataKey?: string, includeInvisible?: boolean },
  parentMatrix: HitTestMatrix,
): { node: FakeCocosNode, metadata?: Record<string, unknown> } | undefined {
  const nodeMatrix = root.kind === 'stage' ? parentMatrix : multiplyMatrix(parentMatrix, fakeNodeMatrix(root))
  const children = [...root.children].sort((left, right) => (right.transform.zIndex || 0) - (left.transform.zIndex || 0))
  for (const child of children) {
    const hit = hitTestNode(child, point, options, nodeMatrix)
    if (hit)
      return hit
  }
  if (!options.includeInvisible && root.visible === false)
    return undefined
  if (options.metadataKey && root.metadata[options.metadataKey] === undefined)
    return undefined
  if (!containsPoint(root, point, nodeMatrix))
    return undefined
  return { node: root, metadata: { ...root.metadata } }
}

interface HitTestMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function fakeNodeMatrix(node: FakeCocosNode): HitTestMatrix {
  const transform = node.transform
  const width = numberValue(transform.width, 0)
  const height = numberValue(transform.height, 0)
  const anchorX = numberValue(transform.anchorX, 0) * width
  const anchorY = numberValue(transform.anchorY, 0) * height
  let matrix = translateMatrix(numberValue(transform.x, 0), numberValue(transform.y, 0))
  matrix = multiplyMatrix(matrix, translateMatrix(anchorX, anchorY))
  matrix = multiplyMatrix(matrix, rotateMatrix(numberValue(transform.rotation, 0)))
  matrix = multiplyMatrix(matrix, scaleMatrix(numberValue(transform.scaleX, 1), numberValue(transform.scaleY, 1)))
  matrix = multiplyMatrix(matrix, translateMatrix(-anchorX, -anchorY))
  return matrix
}

function containsPoint(node: FakeCocosNode, point: { x: number, y: number }, matrix: HitTestMatrix): boolean {
  const width = typeof node.transform.width === 'number' ? node.transform.width : undefined
  const height = typeof node.transform.height === 'number' ? node.transform.height : undefined
  if (width === undefined || height === undefined)
    return true
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

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function listFiles(files: Map<string, Uint8Array>, rootPath: string): CocosHostFileInfo[] {
  const normalizedRoot = normalizePath(rootPath)
  return Array.from(files.entries())
    .filter(([path]) => path.startsWith(normalizedRoot))
    .map(([path, bytes]) => ({ path, size: bytes.byteLength }))
}

function normalizePath(path: string): string {
  return path.replace(/^cocos:\/\//, '').replace(/^\/+/, '')
}

function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}:${idCounter}`
}

function nextNumericId(): number {
  idCounter += 1
  return idCounter
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
