import { describe, expect, it } from 'vitest'
import { createCocosCreatorHost } from '../src/creator'
import { createFakeCocosHost } from '../src/testing'

describe('createFakeCocosHost', () => {
  it('tracks node lifecycle and input events', () => {
    const host = createFakeCocosHost()
    const parent = host.nodes.createNode('layer', { parent: host.root })
    const child = host.nodes.createNode('sprite', { parent })
    host.nodes.setNodeTransform(child, { x: 10, y: 20, opacity: 0.5 })

    expect(host.root.children).toContain(parent)
    expect(parent.children).toContain(child)
    expect(child.transform).toMatchObject({ x: 10, y: 20, opacity: 0.5 })

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
