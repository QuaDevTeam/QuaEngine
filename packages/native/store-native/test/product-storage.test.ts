import { QuaStore, StorageManager } from '@quajs/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveNativeProductStorage } from '../src'

function installProductStorage() {
  const disk = new Map<string, string>()
  const batch = vi.fn((changes: [string, string | null][]) => {
    for (const [key, value] of changes) {
      if (value === null)
        disk.delete(key)
      else
        disk.set(key, value)
    }
  })
  vi.stubGlobal('__quaNativeProductStorage', (op: string, key: string, text?: string) => {
    switch (op) {
      case 'read': return JSON.stringify(disk.get(key) ?? null)
      case 'list': return JSON.stringify([...disk.keys()].filter(id => id.startsWith(key)))
      case 'write':
        disk.set(key, text!)
        break
      case 'delete':
        disk.delete(key)
        break
      case 'batch':
        batch(JSON.parse(text!))
        break
      default: throw new Error(op)
    }
    return 'null'
  })
  return { disk, batch }
}

const slot = {
  slotId: '存档①',
  name: '开场🌠',
  metadata: { sceneName: '雨夜', stepId: '1', playtime: 32 },
  storeData: { state: { line: '雨夜🌠' }, snapshots: [] },
}

afterEach(() => vi.unstubAllGlobals())

describe('standalone product store', () => {
  it('preserves embedded fallback when no product capability is installed', () => {
    expect(resolveNativeProductStorage('game')).toBeUndefined()
  })

  it('opens UTF-8 slots and player settings after creating a fresh engine store', async () => {
    const { batch, disk } = installProductStorage()
    vi.stubGlobal('TextEncoder', undefined)
    vi.stubGlobal('TextDecoder', undefined)
    const first = resolveNativeProductStorage('story')!
    first.setItem('settings', JSON.stringify({ speed: 40 }))
    await new QuaStore('game', { storage: first.store }).saveToSlot(slot)
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch.mock.calls[0][0]).toHaveLength(2)
    const reopened = resolveNativeProductStorage('story')!
    expect(JSON.parse(reopened.getItem('settings')!)).toEqual({ speed: 40 })
    const engine = new QuaStore('game', { storage: reopened.store })
    expect(await engine.getSlot(slot.slotId)).toMatchObject({ storeData: slot.storeData })
    expect(await engine.listSlots()).toMatchObject([{ name: slot.name, timestamp: expect.any(Date) }])
    await engine.deleteSlot(slot.slotId)
    reopened.removeItem('settings')
    expect(disk.size).toBe(0)
  })

  it('leaves the old revision intact when the host rejects a commit and serializes competing slot saves', async () => {
    const { batch } = installProductStorage()
    const storage = resolveNativeProductStorage('story')!.store
    const engine = new QuaStore('game', { storage })
    await engine.saveToSlot(slot)
    batch.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    await expect(engine.saveToSlot({ ...slot, name: 'replacement' })).rejects.toThrow('disk full')
    expect(await engine.listSlots()).toMatchObject([{ name: slot.name, revision: 1 }])
    const results = await Promise.all([engine.saveToSlot(slot), engine.saveToSlot(slot)])
    expect(results.map(result => result.index.revision)).toEqual([2, 3])
    const manager = new StorageManager(storage)
    await expect(manager.transaction('readwrite', async (transaction) => {
      await transaction.deleteGameSlotIndex(slot.slotId)
      expect(await transaction.listGameSlotIndexes()).toEqual([])
      expect(await manager.listGameSlotIndexes()).toHaveLength(1)
      throw new Error('cancel')
    })).rejects.toThrow('cancel')
    expect(await engine.listSlots()).toHaveLength(1)
  })
})
