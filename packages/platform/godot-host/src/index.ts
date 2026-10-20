import type {
  SceneHost,
  SceneHostCaptureResult,
  SceneHostInputEvent,
  SceneHostInputListener,
  SceneHostNode,
  SceneHostResource,
} from '@quajs/scene-host'
import type { GodotNativeBridge } from './bridge'
import { callGodot, nativeBridge, resourcePath, storagePath } from './bridge'
import { onGodotTick } from './globals'

export type { GodotNativeBridge } from './bridge'
export type { SceneHost as GodotHost } from '@quajs/scene-host'

/** A native projection host. Its maps contain resource leases and node handles only. */
export function createGodotHost(bridge: GodotNativeBridge = nativeBridge()): SceneHost & { destroy: () => void } {
  const call = <T = void>(method: string, payload?: unknown) => callGodot<T>(bridge, method, payload)
  let sequence = 0
  const nodes = new Map<string, SceneHostNode>()
  const children = new Map<string, SceneHostNode[]>()
  const parents = new Map<string, string>()
  const metadata = new Map<string, Record<string, unknown>>()
  const leases = new Map<string, { resource: SceneHostResource, count: number }>()
  const inputs = new Set<SceneHostInputListener>()
  const layouts = new Set<() => void>()
  const ended = new Map<string, Set<() => void>>()
  const frames = new Map<number, (time: number) => void>()
  const captures = new Map<string, { resolve: (capture: SceneHostCaptureResult) => void, reject: (error: Error) => void }>()
  let destroyed = false
  const root = { id: 'root', kind: 'root' }
  nodes.set(root.id, root)
  const remove = (node: SceneHostNode) => {
    for (const child of children.get(node.id) || [])
      remove(child)
    const parent = parents.get(node.id)
    if (parent)
      children.set(parent, (children.get(parent) || []).filter(child => child.id !== node.id))
    parents.delete(node.id)
    children.delete(node.id)
    nodes.delete(node.id)
    metadata.delete(node.id)
  }
  const read = (path: string) => call<boolean>('file_exists', { path }) ? bridge.read(path) : undefined
  const write = (path: string, bytes: Uint8Array) => {
    if (!bridge.write(path, bytes))
      throw new Error(`Cannot write Godot storage: ${path}`)
  }
  let dispatch: Promise<void> = Promise.resolve()
  const disposeTick = onGodotTick((time, events) => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks)
      callback(time)
    for (const entry of events) {
      const event = entry as SceneHostInputEvent & { type?: string, id?: string }
      if (event.type === 'layout') {
        for (const listener of layouts)
          listener()
      }
      else if (event.type === 'audio-ended') {
        for (const listener of ended.get(event.id || '') || [])
          listener()
      }
      else if (event.type === 'capture-ready') {
        const result = entry as { id: string, path?: string, error?: string, mimeType: string, width: number, height: number }
        const pending = captures.get(result.id)
        captures.delete(result.id)
        if (!pending)
          continue
        try {
          if (result.error || !result.path)
            throw new Error(result.error || 'Godot capture returned no image')
          pending.resolve({ bytes: bridge.read(result.path), mimeType: result.mimeType, width: result.width, height: result.height, capturedAt: time })
        }
        catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))) }
        finally {
          if (result.path)
            call('file_delete', { path: result.path })
        }
      }
      else {
        // Preserve event ordering across asynchronous pipeline dispatch.
        dispatch = dispatch.then(async () => {
          if (destroyed)
            return
          for (const listener of [...inputs])
            await listener(event)
        }).catch(error => call('log', { level: 'error', text: String(error) }))
      }
    }
  })
  const release = (resource: SceneHostResource) => {
    const lease = leases.get(resource.id)
    if (!lease || --lease.count > 0)
      return
    leases.delete(resource.id)
    call('resource_release', { id: resource.id })
  }
  const retain = (resource: SceneHostResource) => {
    const lease = leases.get(resource.id)
    if (!lease)
      throw new Error(`Godot resource already released: ${resource.id}`)
    lease.count++
  }
  const capture = (node: string, options: Record<string, unknown>, viewport?: unknown): Promise<SceneHostCaptureResult> => {
    if (destroyed)
      return Promise.reject(new Error('Godot host is destroyed'))
    const id = `capture${++sequence}`
    return new Promise((resolve, reject) => {
      captures.set(id, { resolve, reject })
      try {
        call('capture_node', { id, node, options, viewport })
      }
      catch (error) {
        captures.delete(id)
        reject(error)
      }
    })
  }
  const host: SceneHost & { destroy: () => void } = {
    runtime: {
      now: () => performance.now(),
      setTargetFrameRate: value => call('frame_rate', { value }),
      warn: (message, details) => call('log', { level: 'warn', text: message, details }),
      error: (message, details) => call('log', { level: 'error', text: message, details }),
    },
    nodes: {
      getRootNode: () => root,
      getNodeChildren: node => children.get(node.id) || [],
      createNode(kind, options = {}) {
        const node = { id: `n${++sequence}`, kind, name: options.name }
        nodes.set(node.id, node)
        call('node_create', { ...node, parent: options.parent?.id || root.id })
        const parent = options.parent || root
        parents.set(node.id, parent.id)
        children.set(parent.id, [...(children.get(parent.id) || []), node])
        return node
      },
      destroyNode(node) {
        call('node_destroy', { id: node.id })
        remove(node)
      },
      appendChild(parent, child) {
        const oldParent = parents.get(child.id)
        if (oldParent)
          children.set(oldParent, (children.get(oldParent) || []).filter(node => node.id !== child.id))
        parents.set(child.id, parent.id)
        children.set(parent.id, [...(children.get(parent.id) || []), child])
        call('node_parent', { id: child.id, parent: parent.id })
      },
      removeChild(parent, child) {
        children.set(parent.id, (children.get(parent.id) || []).filter(node => node.id !== child.id))
        parents.delete(child.id)
        call('node_parent', { id: child.id })
      },
      clearChildren(node) {
        for (const child of [...(children.get(node.id) || [])])
          remove(child)
        call('node_clear', { id: node.id })
      },
      setNodeVisible: (node, visible) => call('node_visible', { id: node.id, visible }),
      setNodeTransform: (node, transform) => call('node_transform', { id: node.id, transform }),
      measureText: (text, style, maxWidth) => call('measure_text', { text, style, maxWidth }),
      setNodeText: (node, text, style) => call('node_text', { id: node.id, text, style }),
      setNodeRichText: (node, text, style) => call('node_text', { id: node.id, text, style, rich: true }),
      setNodeSprite: (node, resource, options) => call('node_sprite', { id: node.id, resource: resource?.id, options }),
      setNodeControl: (node, control) => call('node_control', { id: node.id, control }),
      setNodeColor: (node, color) => call('node_box', { id: node.id, style: { backgroundColor: color } }),
      setNodeBoxStyle: (node, style) => call('node_box', { id: node.id, style }),
      setNodeMetadata(node, value) {
        metadata.set(node.id, value)
        call('node_metadata', { id: node.id, metadata: value })
      },
      getNodeMetadata: node => metadata.get(node.id),
      hitTest(node, point, options) {
        const id = call<string | null>('hit_test', { id: node.id, point, options })
        return id && nodes.has(id) ? { node: nodes.get(id)!, metadata: metadata.get(id) } : undefined
      },
      getContainerSize: () => call('container_size'),
      getDevicePixelRatio: () => 1,
      onLayoutChange(listener) {
        layouts.add(listener)
        return () => layouts.delete(listener)
      },
    },
    assets: {
      async loadBytes(source) { return bridge.read(resourcePath(source)) },
      async writeBytes(path, bytes) { write(storagePath(path), bytes) },
      async readBytes(path) { return read(storagePath(path)) },
      async deleteFile(path) { call('file_delete', { path: storagePath(path) }) },
      async listFiles(path) { return call('file_list', { path: storagePath(path) }) },
      async createResource(kind, bytes, options = {}) {
        const id = options.id || `r${++sequence}`
        const existing = leases.get(id)
        if (existing) {
          if (existing.resource.kind !== kind)
            throw new Error(`Godot resource kind mismatch: ${id}`)
          existing.count++
          return existing.resource
        }
        const result = JSON.parse(bridge.resource(JSON.stringify({ ...options, id, kind }), bytes))
        if (result.error)
          throw new Error(result.error)
        const resource = result.value as SceneHostResource
        leases.set(id, { resource, count: 1 })
        return resource
      },
      retainResource: retain,
      releaseResource: release,
    },
    storage: {
      async readText(path) {
        const bytes = read(storagePath(path))
        return bytes ? new TextDecoder().decode(bytes) : undefined
      },
      async writeText(path, value) { write(storagePath(path), new TextEncoder().encode(value)) },
      async readBytes(path) { return read(storagePath(path)) },
      async writeBytes(path, bytes) { write(storagePath(path), bytes) },
      async delete(path) { call('file_delete', { path: storagePath(path) }) },
      async list(path) { return call('file_list', { path: storagePath(path) }) },
      async ensureDir(path) { call('file_mkdir', { path: storagePath(path) }) },
      async move(from, to) { call('file_move', { from: storagePath(from), to: storagePath(to) }) },
    },
    audio: {
      async createAudioHandle(resource, options = {}) {
        const id = options.id || `a${++sequence}`
        retain(resource)
        try {
          call('audio_create', { id, resource: resource.id, options })
        }
        catch (error) {
          release(resource)
          throw error
        }
        let disposed = false
        const action = (method: string, value?: unknown) => {
          if (!disposed)
            call(method, { id, value })
        }
        return {
          id,
          play: () => action('audio_play'),
          pause: () => action('audio_pause'),
          stop: () => action('audio_stop'),
          setVolume: value => action('audio_volume', value),
          setLoop: value => action('audio_loop', value),
          setPlaybackRate: value => action('audio_rate', value),
          seek: value => action('audio_seek', value),
          getPosition: () => disposed ? undefined : call<number>('audio_position', { id }),
          onEnded(listener) {
            const listeners = ended.get(id) || new Set()
            listeners.add(listener)
            ended.set(id, listeners)
            return () => listeners.delete(listener)
          },
          dispose() {
            if (disposed)
              return
            action('audio_dispose')
            disposed = true
            ended.delete(id)
            release(resource)
          },
        }
      },
      setBusVolume: (bus, volume) => call('audio_bus_volume', { bus, volume }),
    },
    fonts: {
      registerFontFace: (resource, options) => call('font_register', { resource: resource.id, options }),
      unregisterFontFace: id => call('font_unregister', { id }),
    },
    input: { onInput(listener) {
      inputs.add(listener)
      return () => inputs.delete(listener)
    } },
    capture: {
      async captureBackdrop(viewport, options = {}) {
        const downsample = Math.max(1, options.downsample || 1)
        const captured = await capture(root.id, { mimeType: 'image/png', maxWidth: viewport.width / downsample, maxHeight: viewport.height / downsample }, viewport)
        const resource = await host.assets.createResource('renderTexture', captured.bytes, { mimeType: 'image/png', metadata: { renderTexture: true } })
        let disposed = false
        return { resource, dispose() {
          if (!disposed) {
            disposed = true
            release(resource)
          }
        } }
      },
      captureNode(node, options = {}) {
        return capture(node.id, options)
      },
    },
    scheduler: {
      requestFrame(callback) {
        const id = ++sequence
        frames.set(id, callback)
        return id
      },
      cancelFrame: (id) => { frames.delete(id) },
      setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms) as unknown as number,
      clearTimeout: id => globalThis.clearTimeout(id),
    },
    capabilities: { localFiles: true, remoteFiles: false, writableStorage: true, input: true, audioEq: false, audioGainAboveUnity: true, audioPlaybackRate: true, video: true, capture: true, fonts: true, nativeAssets: true },
    destroy() {
      if (destroyed)
        return
      destroyed = true
      disposeTick()
      for (const pending of captures.values())
        pending.reject(new Error('Godot host destroyed during capture'))
      captures.clear()
      inputs.clear()
      layouts.clear()
      frames.clear()
      ended.clear()
      leases.clear()
      nodes.clear()
      children.clear()
      parents.clear()
      metadata.clear()
      call('destroy')
    },
  }
  return host
}
