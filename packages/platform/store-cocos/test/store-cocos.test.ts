import type { QuaGameSavePreviewRecord, QuaGameSaveSlotPayload, QuaSnapshot } from '@quajs/store'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { describe, expect, it, vi } from 'vitest'
import { CocosFileStoreBackend } from '../src'

describe('cocos file store backend', () => {
  it('round-trips snapshots, slots, and preview bytes', async () => {
    const host = createFakeCocosHost()
    const backend = new CocosFileStoreBackend({ host })
    await backend.init()

    const snapshot: QuaSnapshot = {
      id: 'snap',
      storeName: 'main',
      data: { ok: true },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    await backend.saveSnapshot(snapshot)
    expect((await backend.getSnapshot('snap'))?.createdAt).toBeInstanceOf(Date)

    const preview: QuaGameSavePreviewRecord = {
      previewId: 'preview',
      slotId: 'slot',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      capturedAt: 1,
      hash: 'hash',
    }
    await backend.saveGameSlotPreview(preview)
    expect((await backend.getGameSlotPreview('preview'))?.bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rolls back readwrite transactions', async () => {
    const host = createFakeCocosHost()
    const backend = new CocosFileStoreBackend({ host })
    await backend.init()
    const slot = createSlot('slot', 1)
    await backend.saveGameSlotPayload(slot)

    await expect(backend.transaction('readwrite', async () => {
      await backend.saveGameSlotPayload(createSlot('slot', 2))
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    expect((await backend.getGameSlotPayload('slot'))?.index.revision).toBe(1)
  })

  it('restores transaction protection after snapshot capture fails', async () => {
    const host = createFakeCocosHost()
    const backend = new CocosFileStoreBackend({ host })
    await backend.init()
    await backend.saveGameSlotPayload(createSlot('slot', 1))
    vi.spyOn(host.storage, 'list').mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(backend.transaction('readwrite', async () => {})).rejects.toThrow('disk unavailable')
    await expect(backend.transaction('readwrite', async () => {
      await backend.saveGameSlotPayload(createSlot('slot', 2))
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect((await backend.getGameSlotPayload('slot'))?.index.revision).toBe(1)
  })

  it('rejects overlapping transactions instead of rolling back another save', async () => {
    const host = createFakeCocosHost()
    const backend = new CocosFileStoreBackend({ host })
    await backend.init()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const first = backend.transaction('readwrite', async () => {
      await gate
    })
    await expect(backend.transaction('readwrite', async () => {})).rejects.toThrow('must not overlap or nest')
    finish()
    await first
    await expect(backend.transaction('readwrite', async () => 1)).resolves.toBe(1)
  })

  it('clears orphaned slot payloads and previews while preserving snapshots', async () => {
    const host = createFakeCocosHost()
    const backend = new CocosFileStoreBackend({ host })
    await backend.init()
    await backend.saveGameSlotPayload(createSlot('orphan', 1))
    await backend.saveGameSlotPreview({ previewId: 'orphan', slotId: 'orphan', bytes: new Uint8Array([1]), byteLength: 1, mimeType: 'image/png', capturedAt: 0 })
    await backend.saveSnapshot({ id: 'keep', storeName: 'main', data: {}, createdAt: new Date(0) })
    await backend.clearGameSlots()
    expect(await backend.getGameSlotPayload('orphan')).toBeUndefined()
    expect(await backend.getGameSlotPreview('orphan')).toBeUndefined()
    expect(await backend.getSnapshot('keep')).toBeDefined()
  })

  it('serializes preview bytes without browser base64 globals', async () => {
    const originalBtoa = globalThis.btoa
    const originalAtob = globalThis.atob
    try {
      Object.defineProperty(globalThis, 'btoa', { value: undefined, configurable: true })
      Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true })
      const host = createFakeCocosHost()
      const backend = new CocosFileStoreBackend({ host })
      await backend.init()
      await backend.saveGameSlotPreview({
        previewId: 'preview',
        slotId: 'slot',
        mimeType: 'image/png',
        bytes: new Uint8Array([0, 1, 2, 253, 254, 255]),
        byteLength: 6,
        capturedAt: 1,
      })
      expect((await backend.getGameSlotPreview('preview'))?.bytes).toEqual(new Uint8Array([0, 1, 2, 253, 254, 255]))
    }
    finally {
      Object.defineProperty(globalThis, 'btoa', { value: originalBtoa, configurable: true })
      Object.defineProperty(globalThis, 'atob', { value: originalAtob, configurable: true })
    }
  })
})

function createSlot(slotId: string, revision: number): QuaGameSaveSlotPayload {
  return {
    slotId,
    index: {
      slotId,
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      revision,
      previewStatus: 'none',
      metadata: {},
    },
    storeData: {
      state: {},
      snapshots: [],
    },
  }
}
