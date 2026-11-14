import type { UnityNativeBridge } from '../src/bridge'
import { describe, expect, it, vi } from 'vitest'
import { createUnityHost } from '../src'
import { resourcePath, storagePath } from '../src/bridge'
import { UnityFileStoreBackend } from '../src/store'

const tick = vi.hoisted(() => ({ listeners: new Set<(time: number, events: unknown[]) => void>() }))
vi.mock('../src/globals', () => ({ onUnityTick: (listener: (time: number, events: unknown[]) => void) => {
  tick.listeners.add(listener)
  return () => tick.listeners.delete(listener)
} }))

function fixture() {
  const files = new Map<string, Uint8Array>()
  const calls: { method: string, args: Record<string, any> }[] = []
  const bridge: UnityNativeBridge = {
    call(method, payload) {
      const args = JSON.parse(payload)
      calls.push({ method, args })
      let value: unknown
      if (method === 'file_exists')
        value = files.has(args.path)
      if (method === 'file_delete')
        files.delete(args.path)
      if (method === 'file_move') {
        if (!files.has(args.from))
          return JSON.stringify({ error: 'missing source' })
        files.set(args.to, files.get(args.from)!)
        files.delete(args.from)
      }
      if (method === 'file_list')
        value = [...files.keys()].filter(path => path.startsWith(`${args.path}/`)).map(path => ({ path: path.slice('store://'.length), size: files.get(path)!.length, mtime: 0 }))
      return JSON.stringify({ value })
    },
    read(path) {
      const bytes = files.get(path)
      if (!bytes)
        throw new Error(`missing file ${path}`)
      return bytes.slice()
    },
    write(path, bytes) {
      files.set(path, bytes.slice())
      return true
    },
    resource(metadata) { return JSON.stringify({ value: JSON.parse(metadata) }) },
  }
  return { files, calls, bridge, host: createUnityHost(bridge) }
}

describe('unity native host', () => {
  it('rejects traversal, network URLs and ambiguous storage paths', () => {
    expect(resourcePath('qua://qua/main.qpk')).toBe('qua://qua/main.qpk')
    expect(storagePath('saves/一.json')).toBe('store://saves/一.json')
    for (const path of ['', '../save', 'x/../save', '/save', 'x\\save', 'https://example.com', 'user://private', 'x//save']) {
      expect(() => resourcePath(path)).toThrow('Invalid Unity resource path')
      expect(() => storagePath(path)).toThrow()
    }
  })

  it('keeps resources alive while audio uses them and releases once', async () => {
    const { host, calls } = fixture()
    const resource = await host.assets.createResource('audio', new Uint8Array([1]), { id: 'sound' })
    const handle = await host.audio.createAudioHandle(resource)
    host.assets.releaseResource(resource)
    expect(calls.filter(call => call.method === 'resource_release')).toHaveLength(0)
    await handle.dispose()
    await handle.dispose()
    expect(calls.filter(call => call.method === 'resource_release')).toHaveLength(1)
    expect(() => host.assets.retainResource!(resource)).toThrow('already released')
    host.destroy()
  })

  it('preserves async pipeline input ordering and stops dispatch after teardown', async () => {
    const { host } = fixture()
    const observed: string[] = []
    let resume!: () => void
    const gate = new Promise<void>((resolve) => {
      resume = resolve
    })
    host.input.onInput(async (event) => {
      observed.push(`${event.code}:start`)
      if (event.code === 'A')
        await gate
      observed.push(`${event.code}:end`)
    })
    for (const listener of tick.listeners) listener(0, [{ kind: 'keyboard', code: 'A' }, { kind: 'keyboard', code: 'B' }])
    await Promise.resolve()
    expect(observed).toEqual(['A:start'])
    resume()
    await vi.waitFor(() => expect(observed).toEqual(['A:start', 'A:end', 'B:start', 'B:end']))
    host.destroy()
    expect(tick.listeners.size).toBe(0)
  })

  it('declares unsupported capture without exposing a nonfunctional API', () => {
    const { host } = fixture()
    expect(host.capabilities?.capture).toBe(false)
    expect(host.capture).toBeUndefined()
    host.destroy()
  })

  it('persists typed data and rolls back failed writes without touching unrelated saves', async () => {
    const { host } = fixture()
    const backend = new UnityFileStoreBackend({ host })
    await backend.init()
    const date = new Date('2026-10-20T00:00:00Z')
    await backend.saveSnapshot({ id: 'keep', storeName: 'main', data: { bytes: new Uint8Array([0, 255]) }, createdAt: date })
    await expect(backend.transaction('readwrite', async () => {
      await backend.deleteSnapshot('keep')
      await backend.saveSnapshot({ id: 'new', storeName: 'main', data: {}, createdAt: date })
      throw new Error('disk full')
    })).rejects.toThrow('disk full')
    const restarted = new UnityFileStoreBackend({ host })
    await restarted.init()
    expect(await restarted.getSnapshot('keep')).toMatchObject({ createdAt: date, data: { bytes: new Uint8Array([0, 255]) } })
    expect(await restarted.getSnapshot('new')).toBeUndefined()
    expect(await host.storage.list('qua-store/transaction-backups')).toEqual([])
    host.destroy()
  })
})
