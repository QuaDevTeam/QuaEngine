import { inflateSync } from 'node:zlib'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { installCreatorCancellation } from '../src/creator-cancellation'
import { encodeCreatorPng } from '../src/creator-png'
import { createCreatorPreviewFileBridge } from '../src/creator-preview-storage'
import { createCocosCreatorRuntimeHost } from '../src/creator-runtime'
import { installCreatorLetterSpacing } from '../src/creator-text'

function fixture() {
  const data = new Map<string, string>()
  const localStorage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), key: (index: number) => [...data.keys()][index], get length() {
    return data.size
  } }
  const assets = new Map<string, any>()
  class Asset {}
  class SpriteFrame {}
  const cc = { sys: { localStorage }, view: { getVisibleSize: () => ({ width: 1920, height: 1080 }) }, Asset, SpriteFrame, resources: { load: vi.fn((path, _type, callback) => callback(assets.has(path) ? null : new Error(path), assets.get(path))) } }
  const rootNode = { getComponent: () => undefined }
  return { cc, assets, create: () => createCocosCreatorRuntimeHost({ cc, rootNode, namespace: 'test' }) }
}

describe('concrete Creator runtime services', () => {
  it('reapplies seek after the native device resets its position on start', async () => {
    vi.useFakeTimers()
    try {
      const { cc } = fixture()
      const callbacks = new Map<string, () => void>()
      const source = { volume: 1, currentTime: 0, play: () => {
        source.currentTime = 0
        callbacks.get('started')?.()
      }, pause() {}, stop() {} }
      class Node {
        addComponent() { return source }
        on(event: string, callback: () => void) { callbacks.set(event, callback) }
        off(event: string) { callbacks.delete(event) }
        destroy() {}
      }
      const sdk = { ...cc, Node, AudioSource: { EventType: { ENDED: 'ended', STARTED: 'started' } } }
      const host = createCocosCreatorRuntimeHost({ cc: sdk, rootNode: { getComponent: () => undefined, addChild() {} }, namespace: 'seek', native: { fileUtils: { getWritablePath: () => '/data/' } } })
      const handle = await host.audio.createAudioHandle({ id: 'clip', kind: 'audio', native: {} }, { id: 'bgm' })
      await handle.seek!(1800)
      await handle.play()
      expect(source.currentTime).toBe(0)
      source.currentTime = 0.016
      await vi.advanceTimersByTimeAsync(16)
      expect(source.currentTime).toBe(1.8)
      await handle.stop()
      await handle.play()
      expect(source.currentTime).toBe(0)
      await handle.dispose()
      expect(callbacks.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it('applies master and bus gain to existing paused sources without restarting them', async () => {
    const { cc } = fixture()
    const source = { volume: 1, clip: undefined, loop: false, play: vi.fn(), pause: vi.fn(), stop: vi.fn() }
    class Node {
      addComponent() { return source }
      on() {}
      off() {}
      destroy() {}
    }
    const sdk = { ...cc, Node, AudioSource: { EventType: { ENDED: 'ended' } } }
    const host = createCocosCreatorRuntimeHost({ cc: sdk, rootNode: { getComponent: () => undefined, addChild() {} }, namespace: 'audio-gain' })
    const handle = await host.audio.createAudioHandle({ id: 'clip', kind: 'audio', native: {} }, { id: 'bgm', bus: 'bgm', volume: 0.25 })
    await handle.play()
    await handle.pause()
    host.audio.setBusVolume!('bgm', 0.5)
    host.audio.setBusVolume!('master', 0.5)
    expect(source.volume).toBe(0.0625)
    await handle.setVolume!(0.4)
    expect(source.volume).toBe(0.1)
    expect(source.play).toHaveBeenCalledOnce()
    expect(source.pause).toHaveBeenCalledOnce()
    await handle.dispose()
    host.audio.setBusVolume!('master', 1)
    expect(source.volume).toBe(0.1)
  })

  // fake-indexeddb clones several 6 MiB records synchronously; keep the quota
  // regression intact when Creator compilation competes for the same CPU.
  it('persists preview byte files beyond localStorage quota across bridge instances', async () => {
    const indexedDB = new IDBFactory()
    const first = createCreatorPreviewFileBridge({ indexedDB, namespace: 'quota-test' })
    const bytes = new Uint8Array(6 * 1024 * 1024).fill(193)
    await first.writeBytes!('snapshots/large', bytes)
    const second = createCreatorPreviewFileBridge({ indexedDB, namespace: 'quota-test' })
    expect(await second.readBytes!('snapshots/large')).toEqual(bytes)
    await second.move!('snapshots/large', 'snapshots/moved')
    expect(await first.readBytes!('snapshots/large')).toBeUndefined()
    expect(await first.list!('snapshots')).toEqual([{ path: 'snapshots/moved', size: bytes.length }])
    await first.delete!('snapshots/moved')
    expect(await second.list!('snapshots')).toEqual([])
  }, 15000)

  it('includes the full camera container when Creator SHOW_ALL reports only its visible stage', () => {
    const { cc } = fixture()
    const module = { ...cc, Canvas: class Canvas {}, view: { ...cc.view, getFrameSize: () => ({ width: 960, height: 720 }) } }
    const host = createCocosCreatorRuntimeHost({ cc: module, rootNode: { getComponent: () => ({ cameraComponent: { orthoHeight: 720 } }) }, namespace: 'layout-test' })
    expect(host.nodes.getContainerSize()).toEqual({ width: 1920, height: 1440 })
  })

  it('measures resize after the Canvas camera listeners and removes pending callbacks on disposal', () => {
    const { cc } = fixture()
    const camera = { orthoHeight: 540 }
    const callbacks = new Map<string, () => void>()
    const scheduled = new Set<() => void>()
    const sdk = { ...cc, Canvas: class Canvas {}, Director: { EVENT_AFTER_UPDATE: 'after-update' }, director: { once: (_event: string, callback: () => void) => scheduled.add(callback), off: (_event: string, callback: () => void) => scheduled.delete(callback) }, view: { ...cc.view, getFrameSize: () => ({ width: 960, height: 720 }), on: (event: string, callback: () => void) => callbacks.set(event, callback), off: (event: string) => callbacks.delete(event) } }
    const host = createCocosCreatorRuntimeHost({ cc: sdk, rootNode: { getComponent: () => ({ cameraComponent: camera }) }, namespace: 'resize-test' })
    const changed = vi.fn(() => host.nodes.getContainerSize())
    const dispose = host.nodes.onLayoutChange!(changed)
    callbacks.get('canvas-resize')!()
    camera.orthoHeight = 720
    expect(changed).not.toHaveBeenCalled()
    for (const callback of scheduled) callback()
    expect(changed).toHaveReturnedWith({ width: 1920, height: 1440 })
    dispose()
    expect(scheduled.size).toBe(0)
    expect(callbacks.size).toBe(0)
  })

  it('keeps the scene camera on screen until a resize draw completes before backdrop capture', async () => {
    const { cc } = fixture()
    const draws: Array<() => void> = []
    const camera = { orthoHeight: 540, targetTexture: undefined as unknown }
    class RenderTexture { reset = vi.fn(); destroy = vi.fn() }
    class SpriteFrame { texture: unknown; rect: unknown; destroy = vi.fn() }
    const sdk = { ...cc, Canvas: class Canvas {}, RenderTexture, SpriteFrame, Rect: class Rect { constructor(public x: number, public y: number, public width: number, public height: number) {} }, Director: { EVENT_AFTER_DRAW: 'after-draw' }, director: { once: (_event: string, callback: () => void) => draws.push(callback) } }
    const host = createCocosCreatorRuntimeHost({ cc: sdk, rootNode: { getComponent: () => ({ cameraComponent: camera }) }, namespace: 'capture-test' })
    const pending = host.capture!.captureBackdrop!({ x: 0, y: 0, width: 1920, height: 1080 })
    await vi.waitFor(() => expect(draws).toHaveLength(1))
    expect(camera.targetTexture).toBeUndefined()
    draws.shift()!()
    await vi.waitFor(() => expect(draws).toHaveLength(1))
    expect(camera.targetTexture).toBeInstanceOf(RenderTexture)
    draws.shift()!()
    const backdrop = await pending
    expect(camera.targetTexture).toBeUndefined()
    expect(backdrop.resource).toMatchObject({ width: 1920, height: 1080 })
    backdrop.dispose()
    expect((backdrop.resource.native as SpriteFrame).destroy).toHaveBeenCalledOnce()
  })

  it('provides idempotent step cancellation in JSB and preserves existing platform constructors', () => {
    const previous = globalThis.AbortController
    const signal = globalThis.AbortSignal
    try {
      vi.stubGlobal('AbortController', undefined)
      vi.stubGlobal('AbortSignal', undefined)
      installCreatorCancellation()
      const constructor = globalThis.AbortController
      const controller = new AbortController()
      const listener = vi.fn()
      const removed = vi.fn()
      controller.signal.addEventListener('abort', listener, { once: true })
      controller.signal.addEventListener('abort', removed)
      controller.signal.removeEventListener('abort', removed)
      controller.abort('chapter jump')
      controller.abort('again')
      expect(controller.signal.aborted).toBe(true)
      expect(controller.signal.reason).toBe('chapter jump')
      expect(listener).toHaveBeenCalledTimes(1)
      expect(removed).not.toHaveBeenCalled()
      expect(() => controller.signal.throwIfAborted()).toThrow('chapter jump')
      installCreatorCancellation()
      expect(globalThis.AbortController).toBe(constructor)
    }
    finally {
      vi.stubGlobal('AbortController', previous)
      vi.stubGlobal('AbortSignal', signal)
      vi.unstubAllGlobals()
    }
  })
  it('loads opaque binary assets and imported sprite frames through extension-free resource keys', async () => {
    const { create, assets, cc } = fixture()
    assets.set('qua/main', { nativeAsset: new Uint8Array([1, 2, 3]).subarray(1) })
    const frame = { addRef: vi.fn(), decRef: vi.fn(), originalSize: { width: 100, height: 200 } }
    assets.set('qua-native/images/room/spriteFrame', frame)
    const host = create()
    expect(await host.assets.loadBytes('assets/resources/qua/main.binary')).toEqual(new Uint8Array([2, 3]))
    const resource = await host.assets.loadResource!('spriteFrame', 'qua-native/images/room.webp', { id: 'main:room' })
    expect(cc.resources.load).toHaveBeenLastCalledWith('qua-native/images/room/spriteFrame', cc.SpriteFrame, expect.any(Function))
    expect(resource).toMatchObject({ width: 100, height: 200 })
    host.assets.releaseResource(resource!)
    expect(frame.decRef).toHaveBeenCalledOnce()
  })

  it('reads a JSB opaque asset through its Creator-resolved native URL', async () => {
    const { cc, assets } = fixture()
    const nativeUrl = 'assets/resources/native/uuid.binary'
    assets.set('qua/main', { nativeUrl })
    const fileUtils = { getWritablePath: () => '/data/', isFileExist: vi.fn(path => path === nativeUrl), getDataFromFile: vi.fn(() => new Uint8Array([81, 80, 75]).buffer) }
    const host = createCocosCreatorRuntimeHost({ cc, rootNode: { getComponent: () => undefined }, namespace: 'native-test', native: { fileUtils } })
    expect(await host.assets.loadBytes('assets/resources/qua/main.binary')).toEqual(new Uint8Array([81, 80, 75]))
    expect(cc.resources.load).toHaveBeenCalledWith('qua/main', cc.Asset, expect.any(Function))
    expect(fileUtils.getDataFromFile).toHaveBeenCalledWith(nativeUrl)
  })

  it('persists preview files across host instances and handles move, list and deletion', async () => {
    const { create } = fixture()
    const first = create()
    await first.storage.writeText('slots/one.json', '{"step":4}')
    const second = create()
    expect(await second.storage.readText('slots/one.json')).toBe('{"step":4}')
    await second.storage.move!('slots/one.json', 'slots/two.json')
    expect(await second.storage.readText('slots/one.json')).toBeUndefined()
    expect(await second.storage.list('slots')).toEqual([expect.objectContaining({ path: expect.stringContaining('slots/two.json') })])
    await second.storage.delete('slots/two.json')
    expect(await second.storage.list('slots')).toEqual([])
  })

  it('does not descend into native dot directory entries while listing saves', async () => {
    const { cc } = fixture()
    const fileUtils = { getWritablePath: () => '/files/', isDirectoryExist: (path: string) => !path.endsWith('.json'), listFiles: (path: string) => {
      const dir = path.replace(/\/$/, '')
      return [`${dir}/./`, `${dir}/../`, `${dir}/slot.json`]
    }, isFileExist: () => true, getDataFromFile: () => new Uint8Array([123, 125]) }
    const host = createCocosCreatorRuntimeHost({ cc, rootNode: {}, namespace: 'test', native: { fileUtils } })
    expect(await host.storage.list('slots')).toEqual([{ path: '/files/test/slots/slot.json', size: 2 }])
  })

  it('encodes GPU pixels as a valid lossless PNG with top-down scanlines', () => {
    const pixels = new Uint8Array([0, 0, 255, 255, 255, 255, 255, 64, 255, 0, 0, 255, 0, 255, 0, 128])
    const bytes = encodeCreatorPng(pixels, 2, 2)
    const png = Buffer.from(bytes)
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const chunks = []
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
        chunks.push(png.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
    }
    expect([...inflateSync(Buffer.concat(chunks))]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 255, 255, 255, 255, 255, 64])
    const native = Buffer.from(encodeCreatorPng(pixels, 2, 2, false))
    const nativeChunks = []
    for (let offset = 8; offset < native.length;) {
      const length = native.readUInt32BE(offset)
      if (native.toString('ascii', offset + 4, offset + 8) === 'IDAT')
        nativeChunks.push(native.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
    }
    expect([...inflateSync(Buffer.concat(nativeChunks))]).toEqual([0, ...pixels.subarray(0, 8), 0, ...pixels.subarray(8)])
  })

  it('measures and paints spaced native glyphs on the label-owned context and restores it on disposal', () => {
    const calls: unknown[] = []
    class Font { name = 'Noto'; _nativeAsset = 'Noto_LABEL'; destroy = vi.fn() }
    const context = { font: '20px Noto_LABEL', textAlign: 'center', measureText: (text: string) => ({ width: Array.from(text).length * 10 }), fillText: (...args: unknown[]) => calls.push(args) }
    const originalMeasure = context.measureText
    const originalFill = context.fillText
    const label = { font: new Font(), fontSize: 20, _assemblerData: { context }, updateRenderData: vi.fn() }
    const dispose = installCreatorLetterSpacing(label, 2)!
    expect(context.measureText('明天').width).toBe(24)
    context.fillText('明天', 100, 30)
    expect(calls).toEqual([['明', 88, 30], ['天', 100, 30]])
    expect(context.textAlign).toBe('center')
    expect(label.font._nativeAsset).toContain('qua-spacing-2')
    dispose()
    expect(context.measureText).toBe(originalMeasure)
    expect(context.fillText).toBe(originalFill)
    expect(label.font.destroy).toHaveBeenCalledOnce()
  })
})
