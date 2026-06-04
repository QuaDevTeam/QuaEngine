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
})

describe('createCocosCreatorHost', () => {
  it('uses injected file, resource, input, and capture bridges', async () => {
    const files = new Map<string, Uint8Array>()
    const inputListeners = new Set<(event: { kind: 'pointer', phase: 'down', x: number, y: number }) => void>()
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

    const events: unknown[] = []
    host.input.onInput(event => events.push(event))
    for (const listener of inputListeners) {
      listener({ kind: 'pointer', phase: 'down', x: 1, y: 2 })
    }
    expect(events).toHaveLength(1)
    expect(await host.capture?.captureNode(host.nodes.getRootNode())).toMatchObject({ mimeType: 'image/png', width: 1280 })
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
