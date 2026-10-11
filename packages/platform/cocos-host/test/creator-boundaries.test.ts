import type { CocosHostInputEvent } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { createCocosCreatorHost } from '../src/creator'
import { createFakeCocosHost } from '../src/testing'

class UITransform {
  width = 0
  height = 0
  anchorX = 0.5
  anchorY = 0.5
  setContentSize(width: number, height: number) {
    Object.assign(this, { width, height })
  }

  setAnchorPoint(anchorX: number, anchorY: number) {
    Object.assign(this, { anchorX, anchorY })
  }

  convertToNodeSpaceAR(point: { x: number, y: number }) {
    return { x: point.x - 640, y: point.y - 360 }
  }
}
class Node {
  layer = 1
  children: Node[] = []
  parent?: Node
  position = { x: 0, y: 0 }
  scale = { x: 1, y: 1 }
  components = new Map<unknown, any>()
  events = new Map<string, Set<(event: any) => void>>()
  angle = 0
  constructor(public name = '') {}
  getComponent(type: unknown) {
    if (!type)
      throw new Error('Creator getComponent requires a type')
    return this.components.get(type)
  }

  addComponent(Type: new () => unknown) {
    const component = new Type()
    this.components.set(Type, component)
    return component
  }

  addChild(child: Node) {
    child.parent = this
    this.children.push(child)
  }

  removeChild(child: Node) {
    this.children = this.children.filter(item => item !== child)
    child.parent = undefined
  }

  setSiblingIndex(index: number) {
    if (!this.parent)
      return
    const children = this.parent.children
    children.splice(children.indexOf(this), 1)
    children.splice(Math.min(index, children.length), 0, this)
  }

  setPosition(x: number, y: number) {
    this.position = { x, y }
  }

  getPosition() {
    return this.position
  }

  setScale(x: number, y: number) {
    this.scale = { x, y }
  }

  getScale() {
    return this.scale
  }

  on(type: string, handler: (event: any) => void) {
    const listeners = this.events.get(type) || new Set()
    listeners.add(handler)
    this.events.set(type, listeners)
  }

  off(type: string, handler: (event: any) => void) {
    this.events.get(type)?.delete(handler)
  }

  emit(type: string, event: unknown) {
    for (const handler of this.events.get(type) || [])
      handler(event)
  }
}

function creator() {
  const root = new Node('root')
  const ui = root.addComponent(UITransform) as UITransform
  ui.setContentSize(1280, 720)
  const input = new Node()
  const host = createCocosCreatorHost({ rootNode: root, cc: { Node, UITransform, input }, runtime: { warn: vi.fn() } })
  return { root, input, host }
}

describe('creator native boundaries', () => {
  it('records video transport in fake and Creator hosts without claiming a Creator decoder', () => {
    class Sprite { spriteFrame: unknown }
    const warn = vi.fn()
    const host = createCocosCreatorHost({ rootNode: new Node(), cc: { Node, UITransform, Sprite }, runtime: { warn } })
    const fake = createFakeCocosHost()
    const options = { mode: 'video' as const, video: { loop: false, muted: true, playbackRate: 1.5, seekMs: 1800, offsetMs: 100, volume: 0.4 } }
    const resource = { id: 'video', kind: 'video' as const, native: {} }
    const node = host.nodes.createNode('video', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeSprite(node, resource, options)
    expect((node.native as any).spriteOptions).toEqual(options)
    expect(host.capabilities?.video).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('video projection is unavailable'), undefined)
    const fakeNode = fake.nodes.createNode('video')
    fake.nodes.setNodeSprite(fakeNode, resource, options)
    expect(fake.nodesById.get(fakeNode.id)?.spriteOptions).toEqual(options)
  })
  it('restores logical sprite bounds after a downsampled frame changes its presentation size', () => {
    const root = new Node()
    const host = createCocosCreatorHost({ rootNode: root, cc: { Node, UITransform, Sprite: class Sprite {} } })
    const image = host.nodes.createNode('image', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(image, { width: 1920, height: 1080 })
    host.nodes.setNodeSprite(image)
    const visual = (image.native as Node).children[0]
    const sprite = visual.getComponent([...visual.components.keys()].find(key => key !== UITransform))
    Object.defineProperty(sprite, 'spriteFrame', { get() {
      return undefined
    }, set() {
      visual.getComponent(UITransform).setContentSize(240, 135)
    } })
    host.nodes.setNodeSprite(image, { id: 'backdrop', kind: 'spriteFrame', native: {} })
    expect(visual.getComponent(UITransform)).toMatchObject({ width: 1920, height: 1080 })
    expect(sprite.trim).toBe(false)
  })

  it('inherits the parent render layer for projection nodes and presentation children', () => {
    class Sprite {}
    const root = new Node()
    root.layer = 1 << 25
    const host = createCocosCreatorHost({ rootNode: root, cc: { Node, UITransform, Sprite } })
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode() })
    const image = host.nodes.createNode('image', { parent: stage })
    host.nodes.setNodeSprite(image, { id: 'image', kind: 'spriteFrame', native: {} })
    const nativeStage = (stage as any).native as Node
    const nativeImage = (image as any).native as Node
    expect(nativeStage.layer).toBe(root.layer)
    expect(nativeImage.layer).toBe(root.layer)
    expect(nativeImage.children[0].layer).toBe(root.layer)
  })

  it('draws solid scene fades in native Graphics and follows logical size and anchors', () => {
    class Graphics {
      fillColor: unknown
      clear = vi.fn()
      rect = vi.fn()
      fill = vi.fn()
    }
    const host = createCocosCreatorHost({ rootNode: new Node(), cc: { Node, UITransform, Graphics } })
    const overlay = host.nodes.createNode('scene-transition', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(overlay, { width: 1920, height: 1080 })
    host.nodes.setNodeColor!(overlay, '#000000')
    const visual = ((overlay as any).native as Node).children.find(node => node.name === 'qua-color')!
    expect(visual).toBeDefined()
    const graphics = visual.getComponent(Graphics) as Graphics
    expect(graphics.rect).toHaveBeenLastCalledWith(0, -1080, 1920, 1080)
    expect(graphics.fillColor).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    host.nodes.setNodeTransform(overlay, { width: 200, height: 100, anchorX: 0.5, anchorY: 0.5 })
    expect(graphics.rect).toHaveBeenLastCalledWith(-100, -50, 200, 100)
    host.nodes.setNodeColor!(overlay, undefined)
    expect((visual as any).active).toBe(false)
  })

  it('draws rounded control borders and semantic chevrons without rectangular border strips', () => {
    class Graphics {
      fillColor: unknown
      strokeColor: unknown
      lineWidth = 0
      clear = vi.fn()
      rect = vi.fn()
      roundRect = vi.fn()
      moveTo = vi.fn()
      lineTo = vi.fn()
      stroke = vi.fn()
      fill = vi.fn()
    }
    const host = createCocosCreatorHost({ rootNode: new Node(), cc: { Node, UITransform, Graphics } })
    const knob = host.nodes.createNode('box', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(knob, { width: 23, height: 23 })
    host.nodes.setNodeBoxStyle!(knob, { backgroundColor: '#42796e', borderColor: '#fffdf7', borderWidth: 4, borderRadius: 12 })
    const graphics = ((knob as any).native as Node).children[0].getComponent(Graphics) as Graphics
    expect(graphics.rect).not.toHaveBeenCalled()
    expect(graphics.roundRect).toHaveBeenLastCalledWith(2, -21, 19, 19, 9.5)
    expect(graphics.stroke).toHaveBeenCalled()
    expect(graphics.lineWidth).toBe(4)
    host.nodes.setNodeTransform(knob, { width: 13, height: 8 })
    graphics.rect.mockClear()
    graphics.fill.mockClear()
    host.nodes.setNodeBoxStyle!(knob, { shape: 'chevron-down', backgroundColor: '#42796e' })
    expect(graphics.moveTo).toHaveBeenLastCalledWith(1, -1)
    expect(graphics.lineTo.mock.calls.slice(-2)).toEqual([[6.5, -7], [12, -1]])
    expect(graphics.rect).not.toHaveBeenCalled()
    expect(graphics.fill).not.toHaveBeenCalled()
  })

  it('maps top-left stage and nested pivots to Creator Y-up coordinates', () => {
    const { host } = creator()
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(stage, { x: 0, y: 0, width: 1920, height: 1080, scaleX: 2 / 3, scaleY: 2 / 3 })
    const nativeStage = (stage as any).native as Node
    expect(nativeStage.position).toEqual({ x: -640, y: 360 })
    expect(nativeStage.getComponent(UITransform)).toMatchObject({ anchorX: 0, anchorY: 1 })
    const child = host.nodes.createNode('sprite', { parent: stage })
    host.nodes.setNodeTransform(child, { x: 100, y: 200, width: 100, height: 40, anchorX: 0.5, anchorY: 0.5, rotation: 90 })
    const native = (child as any).native as Node
    expect(native.position).toEqual({ x: 150, y: -220 })
    expect(native.angle).toBe(-90)
    host.nodes.setNodeTransform(child, { x: 300 })
    expect(native.position).toEqual({ x: 350, y: -220 })
    host.nodes.setNodeMetadata?.(child, { action: 'rotate' })
    expect(host.nodes.hitTest?.(stage, { x: 350, y: 210 }, { metadataKey: 'action' })?.node).toBe(child)
  })

  it('sorts actual sibling indexes by z order, including large overlay priorities', () => {
    const { host, root } = creator()
    const high = host.nodes.createNode('panel', { parent: host.nodes.getRootNode(), name: 'high' })
    const low = host.nodes.createNode('panel', { parent: host.nodes.getRootNode(), name: 'low' })
    host.nodes.setNodeTransform(high, { zIndex: 10000 })
    host.nodes.setNodeTransform(low, { zIndex: 20 })
    expect(root.children.map(node => node.name)).toEqual(['low', 'high'])
  })

  it('keeps native presentation backgrounds behind projected child labels after updates', () => {
    class Graphics { clear() {}; rect() {}; fill() {} }
    class Label { string = '' }
    const host = createCocosCreatorHost({ rootNode: new Node(), cc: { Node, UITransform, Graphics, Label } })
    const panel = host.nodes.createNode('panel', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(panel, { width: 200, height: 100 })
    host.nodes.setNodeBoxStyle!(panel, { backgroundColor: '#fff' })
    const text = host.nodes.createNode('text', { parent: panel, name: 'title' })
    host.nodes.setNodeText(text, 'Menu')
    const action = host.nodes.createNode('button', { parent: panel, name: 'action' })
    host.nodes.setNodeText(action, 'Save')
    host.nodes.setNodeTransform(panel, { x: 10 })
    expect(((panel as any).native as Node).children.map(child => child.name)).toEqual(['qua-box', 'title', 'action'])
  })

  it('normalizes one Creator touch source and numeric keyboard codes', async () => {
    const { host, root, input } = creator()
    const events: CocosHostInputEvent[] = []
    const dispose = host.input.onInput((event) => {
      events.push(event)
    })
    const nativeEvent = { getUILocation: () => ({ x: 100, y: 600 }) }
    input.emit('touch-start', nativeEvent)
    root.emit('touch-start', nativeEvent)
    input.emit('keydown', { keyCode: 13 })
    input.emit('keydown', { keyCode: 65 })
    await Promise.resolve()
    expect(events).toMatchObject([
      { kind: 'pointer', x: 100, y: 120 },
      { kind: 'keyboard', code: 'Enter' },
      { kind: 'keyboard', code: 'KeyA' },
    ])
    dispose()
    input.emit('touch-start', nativeEvent)
    await Promise.resolve()
    expect(events).toHaveLength(3)
  })

  it('maps a fixed-height native Canvas view point without a camera-center offset', async () => {
    class Canvas { cameraComponent = { node: { worldPosition: { x: 960, y: 540 } } } }
    class NativeUITransform extends UITransform {
      override convertToNodeSpaceAR(point: { x: number, y: number }) {
        return { x: point.x - 960, y: point.y - 540 }
      }
    }
    const root = new Node()
    root.addComponent(Canvas)
    const host = createCocosCreatorHost({ rootNode: root, cc: { Node, UITransform: NativeUITransform, Canvas, view: { getVisibleSize: () => ({ width: 1440, height: 1080 }) } }, layout: { getContainerSize: () => ({ width: 1440, height: 1080 }) } })
    const events: CocosHostInputEvent[] = []
    const dispose = host.input.onInput((event) => {
      events.push(event)
    })
    root.emit('touch-end', { getUILocation: () => ({ x: 223.5, y: 537.75 }) })
    await Promise.resolve()
    expect(events).toMatchObject([{ kind: 'pointer', phase: 'up', x: 223.5, y: 542.25 }])
    dispose()
  })

  it('normalizes Creator Web wheel sensitivity and CSS pixels into container units', async () => {
    const input = new Node()
    const host = createCocosCreatorHost({
      rootNode: new Node(),
      cc: { Node, UITransform, input, Input: { EventType: { MOUSE_WHEEL: 'wheel' } }, sys: { isNative: false }, view: { getFrameSize: () => ({ width: 960, height: 540 }) } },
      layout: { getContainerSize: () => ({ width: 1920, height: 1080 }) },
    })
    const events: CocosHostInputEvent[] = []
    const dispose = host.input.onInput((event) => {
      events.push(event)
    })
    input.emit('wheel', { getUILocation: () => ({ x: 200, y: 500 }), getScrollY: () => -600, getScrollX: () => 100 })
    await Promise.resolve()
    expect(events).toMatchObject([{ kind: 'pointer', phase: 'wheel', metadata: { deltaY: 240, deltaX: 40 } }])
    dispose()
  })

  it('separates text and sprite components and preserves native resource handles in metadata', () => {
    class Label { string = ''; horizontalAlign = 0 }
    class Sprite { spriteFrame: unknown; static SizeMode = { CUSTOM: 0 } }
    const root = new Node()
    const host = createCocosCreatorHost({ rootNode: root, cc: { Node, UITransform, Label, Sprite }, runtime: { warn: vi.fn() } })
    const control = host.nodes.createNode('button', { parent: host.nodes.getRootNode() })
    host.nodes.setNodeTransform(control, { width: 200, height: 50 })
    host.nodes.setNodeText(control, 'Start', { align: 'center' })
    const native: any = {}
    native.self = native
    const resource = { id: 'skin', kind: 'spriteFrame' as const, native }
    host.nodes.setNodeSprite(control, resource, { states: { selected: { resource } } })
    const node = (control as any).native as Node
    const label = node.children.find(child => child.name === 'qua-label')!
    const sprite = node.children.find(child => child.name === 'qua-sprite')!
    expect(label.getComponent(Label)).toMatchObject({ string: 'Start', horizontalAlign: 1 })
    expect(sprite.getComponent(Sprite).spriteFrame).toBe(native)
    expect(sprite.getComponent(UITransform)).toMatchObject({ width: 200, height: 50, anchorX: 0, anchorY: 1 })
    expect((node as any).spriteOptions.states.selected.resource).toBe(resource)
    expect(node.children.indexOf(sprite)).toBeLessThan(node.children.indexOf(label))
  })

  it('preserves URLs and absolute writable paths through file bridges', async () => {
    const files = new Map<string, Uint8Array>()
    const loads: string[] = []
    const host = createCocosCreatorHost({
      rootNode: new Node(),
      writableRoot: '/native/qua',
      files: {
        loadBytes: async (source) => {
          loads.push(source)
          return new Uint8Array([1])
        },
        readBytes: async path => files.get(path),
        writeBytes: async (path, bytes) => {
          files.set(path, bytes)
        },
        delete: async (path) => {
          files.delete(path)
        },
      },
    })
    await host.assets.loadBytes('https://cdn.example.test/game.qpk')
    await host.assets.loadBytes('/bundled/game.qpk')
    expect(loads).toEqual(['https://cdn.example.test/game.qpk', '/bundled/game.qpk'])
    await host.storage.writeBytes('save/a', new Uint8Array([7]))
    await host.storage.move?.('save/a', 'save/b')
    expect([...files.keys()]).toEqual(['/native/qua/save/b'])
    expect(await host.storage.readBytes('/native/qua/save/b')).toEqual(new Uint8Array([7]))
  })

  it('reports unavailable native media and persistence rather than fake success', async () => {
    const host = createCocosCreatorHost({ rootNode: new Node(), writableRoot: '/save' })
    expect(host.capabilities).toMatchObject({ writableStorage: false, video: false, audioPlaybackRate: false })
    await expect(host.assets.createResource('spriteFrame', new Uint8Array([1]))).rejects.toThrow('resources.createResource')
    await expect(host.audio.createAudioHandle({ id: 'audio', kind: 'audio' })).rejects.toThrow('audio.createAudioHandle')
  })
})

describe.each(['fake', 'creator'] as const)('%s hit-test visibility', (kind) => {
  it('does not dispatch to children outside a clipped scroll viewport', () => {
    const host = kind === 'fake' ? createFakeCocosHost() : creator().host
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode() })
    const panel = host.nodes.createNode('scroll', { parent: stage })
    host.nodes.setNodeTransform(panel, { x: 100, y: 100, width: 200, height: 100, clip: { x: 0, y: 0, width: 200, height: 100 } })
    const child = host.nodes.createNode('button', { parent: panel })
    host.nodes.setNodeTransform(child, { y: 80, width: 150, height: 40 })
    host.nodes.setNodeMetadata!(child, { action: 'select' })
    expect(host.nodes.hitTest!(stage, { x: 120, y: 190 }, { metadataKey: 'action' })?.node).toBe(child)
    expect(host.nodes.hitTest!(stage, { x: 120, y: 210 }, { metadataKey: 'action' })).toBeUndefined()
  })
  it('prunes hidden ancestors and chooses the last sibling for equal z', () => {
    const host = kind === 'fake' ? createFakeCocosHost() : creator().host
    const stage = host.nodes.createNode('stage', { parent: host.nodes.getRootNode() })
    const panel = host.nodes.createNode('panel', { parent: stage })
    const first = host.nodes.createNode('button', { parent: panel })
    const last = host.nodes.createNode('button', { parent: panel })
    for (const node of [first, last]) {
      host.nodes.setNodeTransform(node, { width: 100, height: 40 })
      host.nodes.setNodeMetadata?.(node, { action: node.id })
    }
    expect(host.nodes.hitTest?.(stage, { x: 5, y: 5 }, { metadataKey: 'action' })?.node).toBe(last)
    host.nodes.setNodeVisible(panel, false)
    expect(host.nodes.hitTest?.(stage, { x: 5, y: 5 }, { metadataKey: 'action' })).toBeUndefined()
  })
})
