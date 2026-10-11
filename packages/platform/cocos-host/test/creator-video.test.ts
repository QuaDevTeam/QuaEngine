import { describe, expect, it, vi } from 'vitest'
import { createCreatorVideoBridge } from '../src/creator-video'

describe('concrete Creator video resources', () => {
  it('keeps unsupported native hosts on their poster fallback', () => {
    expect(createCreatorVideoBridge({ sys: { isNative: true }, VideoPlayer: {} })).toBeUndefined()
  })

  it('applies SDK transport before readiness, seeks once and releases listeners', () => {
    const events = new Map<string, () => void>()
    const player = { clip: undefined, currentTime: 0, play: vi.fn(), stop: vi.fn(), destroy: vi.fn() }
    const node = { addComponent: () => player, on: (event: string, callback: () => void) => events.set(event, callback), off: (event: string) => events.delete(event) }
    const cc = { sys: { isNative: false }, VideoPlayer: { ResourceType: { LOCAL: 1 }, EventType: { READY_TO_PLAY: 'ready' } } }
    const bridge = createCreatorVideoBridge(cc)!
    const resource = { id: 'movie', kind: 'video' as const, native: {} }
    const options = { video: { loop: true, muted: true, playbackRate: 1.5, seekMs: 1800 } }
    bridge.project(node, resource, options)
    expect(player).toMatchObject({ clip: resource.native, mute: true, loop: true, playbackRate: 1.5 })
    events.get('ready')!()
    expect(player.currentTime).toBe(1.8)
    player.currentTime = 2.1
    bridge.project(node, resource, options)
    expect(player.currentTime).toBe(2.1)
    expect(player.play).toHaveBeenCalledOnce()
    bridge.dispose(node)
    bridge.dispose(node)
    expect(player.stop).toHaveBeenCalledOnce()
    expect(events.size).toBe(0)
  })

  it('uploads decoded RGBA frames and releases the native decoder and GPU resources', () => {
    const callbacks = new Map<string, () => void>()
    const texture = { reset: vi.fn(), uploadData: vi.fn(), destroy: vi.fn() }
    const frame = { texture: undefined, destroy: vi.fn() }
    const sprite = { spriteFrame: null, destroy: vi.fn() }
    class Texture {
      constructor() { return texture }
    }
    class Frame {
      constructor() { return frame }
    }
    const cc = { sys: { isNative: true }, Texture2D: Object.assign(Texture, { PixelFormat: { RGBA8888: 35 } }), SpriteFrame: Frame, Sprite: { SizeMode: { CUSTOM: 0 } }, Director: { EVENT_BEFORE_DRAW: 'draw' }, director: { on: (event: string, callback: () => void) => callbacks.set(event, callback), off: (event: string) => callbacks.delete(event) } }
    const decoder = { create: vi.fn(() => 3), project: vi.fn(), frame: vi.fn(() => ({ positionMs: 1800, durationMs: 3000, rate: 1.5, ready: 1, error: 0, width: 2, height: 1, pixels: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]).buffer })), dispose: vi.fn() }
    const node: any = { addComponent: () => sprite }
    const bridge = createCreatorVideoBridge(cc, decoder)!
    bridge.project(node, { id: 'movie', kind: 'video', native: { nativeUrl: '/pack/movie.mp4' } }, { video: { loop: true, muted: true, seekMs: 1800 } })
    expect(decoder.create).toHaveBeenCalledWith('/pack/movie.mp4')
    expect(decoder.project).toHaveBeenCalledWith(3, true, true, 1, 1, 1800)
    callbacks.get('draw')!()
    expect(texture.uploadData).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]))
    expect(node.__quaVideo.decodedFrames).toBe(1)
    bridge.dispose(node)
    expect(decoder.dispose).toHaveBeenCalledWith(3)
    expect(texture.destroy).toHaveBeenCalledOnce()
    expect(frame.destroy).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(0)
    expect(node.__quaVideo).toBeUndefined()
  })
})
