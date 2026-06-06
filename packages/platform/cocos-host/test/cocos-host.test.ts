import { describe, expect, it, vi } from 'vitest'
import { createCocosCreatorHost } from '../src/creator'
import { createFakeCocosHost } from '../src/testing'

describe('createFakeCocosHost', () => {
  it('tracks node lifecycle and input events', () => {
    const host = createFakeCocosHost()
    const parent = host.nodes.createNode('layer', { parent: host.root })
    const child = host.nodes.createNode('sprite', { parent })
    host.nodes.setNodeTransform(child, { x: 10, y: 20, opacity: 0.5, clip: { x: 0, y: 0, width: 50, height: 60 } })

    expect(host.root.children).toContain(parent)
    expect(parent.children).toContain(child)
    expect(child.transform).toMatchObject({ x: 10, y: 20, opacity: 0.5, clip: { x: 0, y: 0, width: 50, height: 60 } })

    const received: unknown[] = []
    const dispose = host.input.onInput(event => received.push(event))
    host.emitInput({ kind: 'pointer', phase: 'down', x: 1, y: 2 })
    dispose()
    host.emitInput({ kind: 'pointer', phase: 'up', x: 1, y: 2 })
    expect(received).toHaveLength(1)
  })

  it('stores bytes and resources', async () => {
    const host = createFakeCocosHost()
    await host.assets.writeBytes('bundle.qpk', new Uint8Array([1, 2, 3]))
    expect(await host.assets.loadBytes('bundle.qpk')).toEqual(new Uint8Array([1, 2, 3]))

    const resource = await host.assets.createResource('texture', new Uint8Array([4]), { id: 'tex' })
    expect(host.resourcesById.has('tex')).toBe(true)
    host.assets.releaseResource(resource)
    expect(host.resourcesById.has('tex')).toBe(false)

    const native = await host.assets.loadResource?.('spriteFrame', 'assets/resources/hero.png', {
      id: 'native:hero',
      mimeType: 'image/png',
      metadata: { width: 320, height: 180 },
    })
    expect(native).toMatchObject({
      id: 'native:hero',
      kind: 'spriteFrame',
      source: 'assets/resources/hero.png',
      mimeType: 'image/png',
      width: 320,
      height: 180,
      native: { source: 'assets/resources/hero.png', kind: 'spriteFrame' },
    })
    expect(host.capabilities.nativeAssets).toBe(true)
  })

  it('hit-tests nodes by metadata in z order', () => {
    const host = createFakeCocosHost()
    const low = host.nodes.createNode('choice', { parent: host.root, name: 'low' })
    const high = host.nodes.createNode('choice', { parent: host.root, name: 'high' })
    host.nodes.setNodeTransform(low, { x: 0, y: 0, width: 100, height: 100, zIndex: 1 })
    host.nodes.setNodeTransform(high, { x: 0, y: 0, width: 100, height: 100, zIndex: 2 })
    host.nodes.setNodeMetadata?.(low, { choiceId: 'low' })
    host.nodes.setNodeMetadata?.(high, { choiceId: 'high' })

    expect(host.nodes.hitTest?.(host.root, { x: 10, y: 10 }, { metadataKey: 'choiceId' })?.metadata?.choiceId).toBe('high')
  })

  it('hit-tests nested nodes using local transforms in logical stage coordinates', () => {
    const host = createFakeCocosHost()
    const stage = host.nodes.createNode('stage', { parent: host.root, name: 'stage' })
    const panel = host.nodes.createNode('panel', { parent: stage, name: 'panel' })
    const button = host.nodes.createNode('button', { parent: panel, name: 'button' })
    host.nodes.setNodeTransform(stage, { x: 100, y: 50, width: 1920, height: 1080 })
    host.nodes.setNodeTransform(panel, { x: 100, y: 200, width: 300, height: 220 })
    host.nodes.setNodeTransform(button, { x: 10, y: 20, width: 80, height: 40 })
    host.nodes.setNodeMetadata?.(button, { action: 'nested' })

    expect(host.nodes.hitTest?.(stage, { x: 111, y: 221 }, { metadataKey: 'action' })?.metadata?.action).toBe('nested')
    expect(host.nodes.hitTest?.(stage, { x: 11, y: 21 }, { metadataKey: 'action' })).toBeUndefined()
    expect(host.nodes.hitTest?.(stage, { x: 211, y: 271 }, { metadataKey: 'action' })).toBeUndefined()
  })

  it('hit-tests scaled and rotated fake nodes in transformed local space', () => {
    const host = createFakeCocosHost()
    const stage = host.nodes.createNode('stage', { parent: host.root, name: 'stage' })
    const scaled = host.nodes.createNode('button', { parent: stage, name: 'scaled' })
    host.nodes.setNodeTransform(scaled, { x: 0, y: 0, width: 100, height: 40, scaleX: 2, scaleY: 2 })
    host.nodes.setNodeMetadata?.(scaled, { action: 'scaled' })

    const rotated = host.nodes.createNode('button', { parent: stage, name: 'rotated' })
    host.nodes.setNodeTransform(rotated, { x: 200, y: 100, width: 100, height: 40, rotation: 90 })
    host.nodes.setNodeMetadata?.(rotated, { action: 'rotated' })

    expect(host.nodes.hitTest?.(stage, { x: 150, y: 20 }, { metadataKey: 'action' })?.metadata?.action).toBe('scaled')
    expect(host.nodes.hitTest?.(stage, { x: 210, y: 20 }, { metadataKey: 'action' })).toBeUndefined()
    expect(host.nodes.hitTest?.(stage, { x: 190, y: 110 }, { metadataKey: 'action' })?.metadata?.action).toBe('rotated')
    expect(host.nodes.hitTest?.(stage, { x: 210, y: 110 }, { metadataKey: 'action' })).toBeUndefined()
  })

  it('records sliced sprite, control, and audio ended projection state', async () => {
    const host = createFakeCocosHost()
    const node = host.nodes.createNode('button', { parent: host.root })
    const resource = await host.assets.createResource('spriteFrame', new Uint8Array([1]), { id: 'panel' })
    host.nodes.setNodeSprite(node, resource, {
      mode: 'sliced',
      slice: { top: 4, right: 5, bottom: 6, left: 7 },
      contentInsets: { top: 1, right: 2, bottom: 3, left: 4 },
      tint: '#ffffff',
      opacity: 0.8,
      frame: { x: 2, y: 3, width: 64, height: 72 },
      mask: { assetName: 'mask.png', assetType: 'characters', resourceId: 'mask' },
      blendMode: 'multiply',
      filter: { brightness: 1.2, blur: 2 },
      composition: {
        blendMode: 'screen',
        isolation: true,
        filter: { saturate: 0.8 },
        mask: { assetName: 'layer-mask.png', resourceId: 'layer-mask' },
      },
      states: {
        pressed: { resourceId: 'pressed', tint: '#ff0000' },
      },
    })
    host.nodes.setNodeControl?.(node, {
      kind: 'toggle',
      checked: true,
      label: 'Enabled',
      metadata: { source: 'test' },
    })

    const fakeNode = node as any
    expect(fakeNode.sprite).toBe(resource)
    expect(fakeNode.spriteOptions).toMatchObject({
      mode: 'sliced',
      slice: { top: 4, right: 5, bottom: 6, left: 7 },
      contentInsets: { top: 1, right: 2, bottom: 3, left: 4 },
      frame: { x: 2, y: 3, width: 64, height: 72 },
      mask: { assetName: 'mask.png', assetType: 'characters', resourceId: 'mask' },
      blendMode: 'multiply',
      filter: { brightness: 1.2, blur: 2 },
      composition: {
        blendMode: 'screen',
        isolation: true,
      },
      states: {
        pressed: { resourceId: 'pressed', tint: '#ff0000' },
      },
    })
    expect(fakeNode.control).toMatchObject({ kind: 'toggle', checked: true, label: 'Enabled' })

    const handle = await host.audio.createAudioHandle(resource, { id: 'audio:test', playbackRate: 1.25 })
    let ended = 0
    const dispose = handle.onEnded?.(() => {
      ended += 1
    })
    const fakeHandle = handle as any
    fakeHandle.emitEnded()
    dispose?.()
    fakeHandle.emitEnded()
    expect(ended).toBe(1)
    expect(fakeHandle.playbackRate).toBe(1.25)
    handle.setEq?.([{ frequency: 1000, gainDb: -3 }])
    expect(fakeHandle.eqBands).toEqual([{ frequency: 1000, gainDb: -3 }])
    await handle.seek?.(1234)
    expect(fakeHandle.positionMs).toBe(1234)
    expect(fakeHandle.seekCalls).toEqual([1234])
    expect(handle.getPosition?.()).toBe(1234)

    await host.fonts?.registerFontFace(resource, {
      id: 'font:main',
      family: 'Main',
      assetName: 'main.ttf',
      weight: 700,
      style: 'normal',
    })
    expect(host.fontFacesById.get('font:main')).toMatchObject({
      resource,
      options: {
        family: 'Main',
        assetName: 'main.ttf',
        weight: 700,
      },
    })
    await host.fonts?.unregisterFontFace('font:main')
    expect(host.fontFacesById.has('font:main')).toBe(false)
  })
})

describe('createCocosCreatorHost', () => {
  it('uses injected file, resource, input, and capture bridges', async () => {
    const files = new Map<string, Uint8Array>()
    const inputListeners = new Set<(event: { kind: 'pointer', phase: 'down', x: number, y: number }) => void>()
    const registeredFonts: unknown[] = []
    const unregisteredFonts: unknown[] = []
    const host = createCocosCreatorHost({
      rootNode: createNativeNode('root'),
      layout: {
        getContainerSize: () => ({ width: 1280, height: 720 }),
        getDevicePixelRatio: () => 2,
        getSafeAreaInsets: () => ({ top: 10 }),
      },
      files: {
        loadBytes: async source => files.get(source) || new Uint8Array([1]),
        writeBytes: async (path, bytes) => {
          files.set(path, bytes)
        },
        readBytes: async path => files.get(path),
        list: async root => Array.from(files).filter(([path]) => path.startsWith(root)).map(([path, bytes]) => ({ path, size: bytes.byteLength })),
      },
      resources: {
        loadResource: async (kind, source, options) => ({
          id: options.id,
          kind,
          source,
          mimeType: options.mimeType,
          native: { kind, source },
        }),
        createResource: async (kind, data, options) => ({
          id: options.id,
          kind,
          source: options.source,
          native: { kind, byteLength: data.byteLength },
        }),
      },
      input: {
        onInput(listener) {
          inputListeners.add(listener as never)
          return () => inputListeners.delete(listener as never)
        },
      },
      fonts: {
        registerFontFace: async (resource, options) => {
          registeredFonts.push({ resource, options })
        },
        unregisterFontFace: async (id) => {
          unregisteredFonts.push(id)
        },
      },
      capture: {
        async captureNode() {
          return {
            bytes: new Uint8Array([9]),
            mimeType: 'image/png',
            width: 1280,
            height: 720,
            capturedAt: 1,
          }
        },
      },
    })

    await host.assets.writeBytes('cache/file.bin', new Uint8Array([2, 3]))
    expect(await host.assets.loadBytes('cache/file.bin')).toEqual(new Uint8Array([2, 3]))
    expect(host.nodes.getContainerSize()).toEqual({ width: 1280, height: 720 })
    expect(host.nodes.getDevicePixelRatio?.()).toBe(2)
    expect(host.nodes.getSafeAreaInsets?.()).toEqual({ top: 10 })

    const resource = await host.assets.createResource('spriteFrame', new Uint8Array([4, 5]), { id: 'sprite' })
    expect(resource.native).toEqual({ kind: 'spriteFrame', byteLength: 2 })
    expect(await host.assets.loadResource?.('spriteFrame', 'assets/resources/sprite.png', { id: 'native:sprite' })).toMatchObject({
      id: 'native:sprite',
      native: { kind: 'spriteFrame', source: 'assets/resources/sprite.png' },
    })
    const spriteNode = host.nodes.createNode('sprite', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(spriteNode, { clip: { x: 1, y: 2, width: 3, height: 4 } })
    host.nodes.setNodeSprite(spriteNode, resource, {
      states: {
        selected: { resourceId: 'selected' },
      },
    })
    expect((spriteNode as { native?: { quaClip?: unknown, quaSprite?: { spriteStates?: unknown } } }).native?.quaClip).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    expect((spriteNode as { native?: { spriteOptions?: { states?: unknown } } }).native?.spriteOptions?.states).toEqual({
      selected: { resourceId: 'selected' },
    })
    expect(host.capabilities.nativeAssets).toBe(true)
    expect(host.capabilities.fonts).toBe(true)
    await host.fonts?.registerFontFace(resource, { id: 'font', family: 'Main', assetName: 'main.ttf' })
    await host.fonts?.unregisterFontFace('font')
    expect(registeredFonts).toMatchObject([{ options: { family: 'Main', assetName: 'main.ttf' } }])
    expect(unregisteredFonts).toEqual(['font'])

    const events: unknown[] = []
    host.input.onInput(event => events.push(event))
    for (const listener of inputListeners) {
      listener({ kind: 'pointer', phase: 'down', x: 1, y: 2 })
    }
    expect(events).toHaveLength(1)
    expect(await host.capture?.captureNode(host.nodes.getRootNode())).toMatchObject({ mimeType: 'image/png', width: 1280 })
  })

  it('loads remote bytes through Creator assetManager when fetch is unavailable', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', undefined)
    try {
      let requestedUrl = ''
      const host = createCocosCreatorHost({
        rootNode: createNativeNode('root'),
        cc: {
          assetManager: {
            loadRemote(url, _options, callback) {
              requestedUrl = url
              callback(undefined, { native: new Uint8Array([7, 8, 9]) })
            },
          },
        },
      })

      expect(host.capabilities?.remoteFiles).toBe(true)
      await expect(host.assets.loadBytes('https://cdn.example.test/bundle.qpk')).resolves.toEqual(new Uint8Array([7, 8, 9]))
      expect(requestedUrl).toBe('https://cdn.example.test/bundle.qpk')
    }
    finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('rejects Creator remote native path strings as raw bytes', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', undefined)
    try {
      const host = createCocosCreatorHost({
        rootNode: createNativeNode('root'),
        cc: {
          assetManager: {
            loadRemote(_url, _options, callback) {
              callback(undefined, { _nativeAsset: 'native-cache/file.qpk' })
            },
          },
        },
      })

      await expect(host.assets.loadBytes('https://cdn.example.test/bundle.qpk')).rejects.toThrow('did not return byte data')
    }
    finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('preserves Creator zero timestamps and partial transform axes', () => {
    const host = createCocosCreatorHost({
      rootNode: createNativeNode('root'),
      cc: { sys: { now: () => 0 } },
    })
    const node = host.nodes.createNode('sprite', { parent: host.nodes.getRootNode() })

    host.nodes.setNodeTransform(node, { x: 10, y: 20, scaleX: 2, scaleY: 3, width: 100, height: 50 })
    host.nodes.setNodeTransform(node, { x: 30, scaleX: 4 })

    expect(host.runtime.now()).toBe(0)
    expect((node as any).native).toMatchObject({
      x: 30,
      y: 20,
      scaleX: 4,
      scaleY: 3,
      width: 100,
      height: 50,
    })
  })

  it('hit-tests Creator child nodes using accumulated local transforms', () => {
    const host = createCocosCreatorHost({ rootNode: createNativeNode('root') })
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode(), name: 'stage' })
    const panel = host.nodes.createNode('panel', { parent: stage, name: 'panel' })
    const button = host.nodes.createNode('button', { parent: panel, name: 'button' })
    host.nodes.setNodeTransform(stage, { x: 100, y: 50, width: 1920, height: 1080 })
    host.nodes.setNodeTransform(panel, { x: 100, y: 200, width: 300, height: 220 })
    host.nodes.setNodeTransform(button, { x: 10, y: 20, width: 80, height: 40 })
    host.nodes.setNodeMetadata?.(button, { action: 'nested' })

    expect(host.nodes.hitTest?.(stage, { x: 111, y: 221 }, { metadataKey: 'action' })?.metadata?.action).toBe('nested')
    expect(host.nodes.hitTest?.(stage, { x: 11, y: 21 }, { metadataKey: 'action' })).toBeUndefined()
    expect(host.nodes.hitTest?.(stage, { x: 211, y: 271 }, { metadataKey: 'action' })).toBeUndefined()
  })

  it('hit-tests transformed Creator child nodes with scale and rotation', () => {
    const host = createCocosCreatorHost({ rootNode: createNativeNode('root') })
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode(), name: 'stage' })
    const scaled = host.nodes.createNode('button', { parent: stage, name: 'scaled' })
    host.nodes.setNodeTransform(scaled, { x: 0, y: 0, width: 100, height: 40, scaleX: 2, scaleY: 2 })
    host.nodes.setNodeMetadata?.(scaled, { action: 'scaled' })

    const rotated = host.nodes.createNode('button', { parent: stage, name: 'rotated' })
    host.nodes.setNodeTransform(rotated, { x: 200, y: 100, width: 100, height: 40, rotation: 90 })
    host.nodes.setNodeMetadata?.(rotated, { action: 'rotated' })

    expect(host.nodes.hitTest?.(stage, { x: 150, y: 20 }, { metadataKey: 'action' })?.metadata?.action).toBe('scaled')
    expect(host.nodes.hitTest?.(stage, { x: 210, y: 20 }, { metadataKey: 'action' })).toBeUndefined()
    expect(host.nodes.hitTest?.(stage, { x: 190, y: 110 }, { metadataKey: 'action' })?.metadata?.action).toBe('rotated')
    expect(host.nodes.hitTest?.(stage, { x: 210, y: 110 }, { metadataKey: 'action' })).toBeUndefined()
  })

  it('re-enables Creator control components from updated projection state', () => {
    class Node {
      name: string
      children: unknown[] = []
      private components = new Map<unknown, unknown>()

      constructor(name: string) {
        this.name = name
      }

      addChild(child: unknown) {
        this.children.push(child)
      }

      removeChild(child: unknown) {
        this.children = this.children.filter(item => item !== child)
      }

      getComponent(component: unknown) {
        return this.components.get(component)
      }

      addComponent(Component: new () => unknown) {
        const instance = new Component()
        this.components.set(Component, instance)
        return instance
      }
    }
    class Button {
      interactable = true
    }
    class EditBox {
      string = ''
      placeholder = ''
      enabled = true
      readOnly = false
    }
    class Toggle {
      isChecked = false
      interactable = true
    }
    class Slider {
      progress = 0
      enabled = true
    }
    const host = createCocosCreatorHost({
      rootNode: new Node('root'),
      cc: { Node, Button, EditBox, Toggle, Slider },
    })

    const buttonNode = host.nodes.createNode('button', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeControl?.(buttonNode, { kind: 'button', disabled: true })
    expect(getComponent<Button>(buttonNode, Button).interactable).toBe(false)
    host.nodes.setNodeControl?.(buttonNode, { kind: 'button', disabled: false })
    expect(getComponent<Button>(buttonNode, Button).interactable).toBe(true)

    const inputNode = host.nodes.createNode('input', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeControl?.(inputNode, { kind: 'input', value: 'old', readonly: true })
    expect(getComponent<EditBox>(inputNode, EditBox).enabled).toBe(false)
    host.nodes.setNodeControl?.(inputNode, { kind: 'input', value: 'new', readonly: false })
    expect(getComponent<EditBox>(inputNode, EditBox)).toMatchObject({ enabled: true, readOnly: false, string: 'new' })

    const toggleNode = host.nodes.createNode('toggle', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeControl?.(toggleNode, { kind: 'toggle', checked: true, disabled: true })
    expect(getComponent<Toggle>(toggleNode, Toggle).interactable).toBe(false)
    host.nodes.setNodeControl?.(toggleNode, { kind: 'toggle', checked: false, disabled: false })
    expect(getComponent<Toggle>(toggleNode, Toggle)).toMatchObject({ interactable: true, isChecked: false })

    const sliderNode = host.nodes.createNode('slider', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeControl?.(sliderNode, { kind: 'slider', value: '5', min: 0, max: 10, disabled: true })
    expect(getComponent<Slider>(sliderNode, Slider).enabled).toBe(false)
    host.nodes.setNodeControl?.(sliderNode, { kind: 'slider', value: '7', min: 0, max: 10, disabled: false })
    expect(getComponent<Slider>(sliderNode, Slider)).toMatchObject({ enabled: true, progress: 0.7 })
  })
})

function createNativeNode(name: string) {
  return {
    name,
    children: [] as unknown[],
    addChild(child: unknown) {
      this.children.push(child)
    },
    removeChild(child: unknown) {
      this.children = this.children.filter(item => item !== child)
    },
    removeAllChildren() {
      this.children = []
    },
    setPosition(x: number, y: number) {
      Object.assign(this, { x, y })
    },
    setScale(scaleX: number, scaleY: number) {
      Object.assign(this, { scaleX, scaleY })
    },
  }
}

function getComponent<T>(node: unknown, component: new () => T): T {
  return ((node as any).native as { getComponent: (component: unknown) => T }).getComponent(component)
}
