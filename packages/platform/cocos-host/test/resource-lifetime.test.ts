import type { CocosHostResource } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { createCocosCreatorHost } from '../src/creator'
import { createFakeCocosHost } from '../src/testing'

describe('creator resource lifetime', () => {
  it('shares pending native creation and releases only after every owner releases', async () => {
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const release = vi.fn()
    const create = vi.fn(async (kind, _data, options): Promise<CocosHostResource> => {
      await gate
      return { kind, id: options.id, native: {} }
    })
    const host = createCocosCreatorHost({ rootNode: {}, resources: { createResource: create, releaseResource: release } })
    const first = host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'shared' })
    const second = host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'shared' })
    finish()
    const [a, b] = await Promise.all([first, second])
    expect(create).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    host.assets.releaseResource(a)
    expect(release).not.toHaveBeenCalled()
    host.assets.releaseResource(b)
    expect(release).toHaveBeenCalledTimes(1)
    host.assets.releaseResource(a)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('balances native retain and release hooks for shared resources', async () => {
    const retain = vi.fn()
    const release = vi.fn()
    const host = createCocosCreatorHost({ rootNode: {}, resources: {
      loadResource: async (kind, _source, options) => ({ id: options.id, kind }),
      retainResource: retain,
      releaseResource: release,
    } })
    const a = (await host.assets.loadResource!('spriteFrame', 'image', { id: 'shared' }))!
    const b = (await host.assets.loadResource!('spriteFrame', 'image', { id: 'shared' }))!
    expect(a).toBe(b)
    host.assets.retainResource!(a)
    expect(retain).toHaveBeenCalledTimes(2)
    host.assets.releaseResource(a)
    host.assets.releaseResource(b)
    host.assets.releaseResource(a)
    expect(release).toHaveBeenCalledTimes(3)
  })

  it('rejects and releases malformed bridge resources instead of leaking their cache entries', async () => {
    const release = vi.fn()
    const host = createCocosCreatorHost({ rootNode: {}, resources: {
      createResource: async kind => ({ id: 'incorrect', kind }),
      releaseResource: release,
    } })
    await expect(host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'expected' })).rejects.toThrow('expected')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('fake host resource lifetime', () => {
  it('keeps shared resources alive and ignores stale releases after re-creation', async () => {
    const host = createFakeCocosHost()
    const a = await host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'shared' })
    const b = await host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'shared' })
    host.assets.releaseResource(a)
    expect(host.resourcesById.get('shared')).toBe(b)
    host.assets.releaseResource(b)
    expect(host.resourcesById.size).toBe(0)
    const replacement = await host.assets.createResource('spriteFrame', new Uint8Array(), { id: 'shared' })
    host.assets.releaseResource(a)
    expect(host.resourcesById.get('shared')).toBe(replacement)
    host.assets.releaseResource(replacement)
  })
})
