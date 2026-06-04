import type { QuaGameSavePreviewRecord, QuaGameSaveSlotPayload, QuaSnapshot } from '@quajs/store'
import { describe, expect, it } from 'vitest'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { CocosFileStoreBackend } from '../src'

describe('CocosFileStoreBackend', () => {
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
