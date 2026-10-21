import { describe, expect, it, vi } from 'vitest'
import { createCreatorSpriteBlur } from '../src/creator-blur'

function fixture() {
  const callbacks = new Set<() => void>()
  const materials: Material[] = []
  const textures: RenderTexture[] = []
  const frames: SpriteFrame[] = []
  class UITransform {
    width = 1920
    height = 1080
    setContentSize(w: number, h: number) {
      this.width = w
      this.height = h
    }
  }
  class Canvas { cameraComponent: unknown; alignCanvasWithScreen = true }
  class Camera { static ProjectionType = { ORTHO: 1 }; static ClearFlag = { SOLID_COLOR: 1 }; visibility = -1 }
  class Node {
    active = true
    layer = 0
    components = new Map()
    destroy = vi.fn()
    addChild() {}
    setPosition() {}
    addComponent(Type: any) {
      const value = new Type()
      this.components.set(Type, value)
      return value
    }

    getComponent(type: any) { return this.components.get(type) }
  }
  class Sprite { static SizeMode = { CUSTOM: 0 } }
  class Material {
    properties = new Map()
    destroy = vi.fn()
    recompileShaders = vi.fn()
    constructor() { materials.push(this) }
    initialize() {}
    overridePipelineStates() {}
    setProperty(name: string, value: unknown) { this.properties.set(name, value) }
  }
  class RenderTexture {
    width = 0
    height = 0
    destroy = vi.fn()
    constructor() { textures.push(this) }
    reset(size: { width: number, height: number }) { Object.assign(this, size) }
    setFilters() {}
  }
  class SpriteFrame {
    texture = { width: 1920, height: 1080 }
    get rect() { return { x: 0, y: 0, ...this.texture } }
    destroy = vi.fn()
    addRef = vi.fn()
    decRef = vi.fn()
    constructor() { frames.push(this) }
  }
  const root = new Node()
  const camera = new Camera()
  root.addComponent(Canvas).cameraComponent = camera
  const cc = { Node, UITransform, Canvas, Camera, Sprite, Material, RenderTexture, SpriteFrame, Color: class {}, Vec4: class { constructor(public x: number, public y: number, public z: number, public w: number) {} }, Texture2D: { Filter: { LINEAR: 1 } }, Director: { EVENT_AFTER_DRAW: 'draw' }, director: { getScene: () => root, once: (_event: string, cb: () => void) => callbacks.add(cb), off: (_event: string, cb: () => void) => callbacks.delete(cb) } }
  const source = new SpriteFrame()
  const node = new Node()
  node.addComponent(UITransform)
  const sprite = { node, spriteFrame: source }
  const material = new Material()
  const blur = createCreatorSpriteBlur(cc, root, {})
  const project = () => blur.project(sprite, { id: 'image', kind: 'spriteFrame', native: source }, 12, material)
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  const draw = async () => {
    const pending = [...callbacks]
    callbacks.clear()
    pending.forEach(cb => cb())
    await flush()
  }
  return { callbacks, materials, textures, frames, source, sprite, material, camera, blur, project, flush, draw }
}

describe('creator Gaussian resources', () => {
  it('prefilters once, uses adjacent horizontal/vertical taps, and releases every scratch and output', async () => {
    const f = fixture()
    const dispose = f.project()
    await f.flush()
    await f.draw()
    await f.draw()
    await f.draw()
    await f.blur.settled()
    expect(f.textures.map(t => [t.width, t.height])).toEqual([[960, 540], [960, 540], [960, 540]])
    expect(f.materials.slice(1).map(m => m.properties.get('blurInfo').x)).toEqual([0, 6, 6])
    expect(f.materials[2].properties.get('blurStep')).toMatchObject({ x: 1 / 960, y: 0 })
    expect(f.materials[3].properties.get('blurStep')).toMatchObject({ x: 0, y: 1 / 540 })
    expect(f.sprite.spriteFrame).not.toBe(f.source)
    expect(f.source.decRef).toHaveBeenCalledOnce()
    expect(f.camera.visibility).toBe(-1)
    dispose()
    dispose()
    expect(f.source.decRef).toHaveBeenCalledWith(false)
    for (const texture of f.textures) expect(texture.destroy).toHaveBeenCalledOnce()
    for (const frame of f.frames.slice(1)) expect(frame.destroy).toHaveBeenCalledOnce()
    for (const material of f.materials.slice(1)) expect(material.destroy).toHaveBeenCalledOnce()
  })

  it('cancels an in-flight draw without assigning stale textures or retaining callbacks', async () => {
    const f = fixture()
    const dispose = f.project()
    await f.flush()
    expect(f.callbacks.size).toBe(1)
    dispose()
    await f.blur.settled()
    expect(f.callbacks.size).toBe(0)
    expect(f.sprite.spriteFrame).toBe(f.source)
    expect(f.source.decRef).toHaveBeenCalledOnce()
    expect(f.camera.visibility).toBe(-1)
    for (const texture of f.textures) expect(texture.destroy).toHaveBeenCalledOnce()
  })

  it('releases a cancelled queued source without allocating GPU targets', async () => {
    const f = fixture()
    f.project()()
    await f.blur.settled()
    expect(f.source.decRef).toHaveBeenCalledOnce()
    expect(f.textures).toHaveLength(0)
  })
})
