import type {
  QuaGameSavePreviewRecord,
  QuaGameSaveSlotIndex,
  QuaGameSaveSlotPayload,
  QuaSnapshot,
} from '@quajs/store'
import type { NativeHostApiRequest, QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'
import { createNativeHostApiFromBridge } from '@quajs/native-contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  NativeStoreBackend,
  createNativeStorageConfig,
  createNativeStoreNamespace,
} from '../src'

function createHost(): QuaNativeHostApi & { storage: Map<string, Uint8Array> } {
  const storage = new Map<string, Uint8Array>()
  return {
    storage,
    getHostInfo: vi.fn(),
    readAssetBytes: vi.fn(),
    readStorage: vi.fn(async key => storage.get(key)),
    writeStorage: vi.fn(async (key, value) => {
      storage.set(key, new Uint8Array(value))
    }),
    deleteStorage: vi.fn(async key => {
      storage.delete(key)
    }),
    listStorageKeys: vi.fn(async prefix => [...storage.keys()].filter(key => key.startsWith(prefix))),
    hashBytes: vi.fn(),
  }
}

function createHostInfo(profile: QuaNativeHostInfo['app']['profile'] = 'debug'): QuaNativeHostInfo {
  return {
    app: {
      name: 'Native Fixture',
      bundleId: 'dev.quajs.native.fixture',
      version: '1.0.0',
      buildNumber: '100',
      profile,
      platform: 'macos',
      arch: 'arm64',
    },
    renderer: {
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      capabilities: [],
    },
    runtime: {
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    },
  }
}

function createSnapshot(id: string, storeName = 'engine', createdAt = new Date('2026-06-24T00:00:00.000Z')): QuaSnapshot {
  return {
    id,
    storeName,
    data: { stepId: id },
    createdAt,
    scope: {
      type: 'store',
      storeNames: [storeName],
    },
  }
}

function createSlotIndex(slotId: string, timestamp = new Date('2026-06-24T00:00:00.000Z')): QuaGameSaveSlotIndex {
  return {
    slotId,
    name: `Slot ${slotId}`,
    timestamp,
    revision: 1,
    saveOpId: `save-${slotId}`,
    previewStatus: 'ready',
    preview: {
      previewId: `preview-${slotId}`,
      mimeType: 'image/png',
      byteLength: 3,
      capturedAt: timestamp.getTime(),
      hash: `hash-${slotId}`,
    },
    metadata: {
      sceneName: 'opening',
      stepId: 'step-1',
      playtime: 10,
    },
  }
}

function createSlotPayload(slotId: string): QuaGameSaveSlotPayload {
  const index = createSlotIndex(slotId)
  return {
    slotId,
    index,
    storeData: {
      state: { current: 'opening' },
      snapshots: [createSnapshot(`snapshot-${slotId}`)],
    },
  }
}

function createPreview(slotId: string): QuaGameSavePreviewRecord {
  return {
    previewId: `preview-${slotId}`,
    slotId,
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    byteLength: 3,
    width: 64,
    height: 36,
    capturedAt: 1782259200000,
    hash: `hash-${slotId}`,
  }
}

describe('@quajs/store-native', () => {
  it('persists snapshots and revives createdAt dates', async () => {
    const host = createHost()
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo(),
      profileId: 'player-a',
    })

    await backend.saveSnapshot(createSnapshot('s1', 'engine', new Date('2026-06-24T00:00:00.000Z')))
    await backend.saveSnapshot(createSnapshot('s2', 'ui', new Date('2026-06-25T00:00:00.000Z')))

    const snapshot = await backend.getSnapshot('s1')
    const metas = await backend.listSnapshots('engine')

    expect(snapshot!.createdAt).toBeInstanceOf(Date)
    expect(snapshot!.createdAt.toISOString()).toBe('2026-06-24T00:00:00.000Z')
    expect(metas).toEqual([
      {
        id: 's1',
        storeName: 'engine',
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        scope: {
          type: 'store',
          storeNames: ['engine'],
        },
      },
    ])
  })

  it('uses the host bridge dispatcher for native store persistence', async () => {
    const requests: NativeHostApiRequest[] = []
    const storage = new Map<string, number[]>()
    const host = createNativeHostApiFromBridge(async (request) => {
      requests.push(request)
      switch (request.method) {
        case 'readStorage':
          return { ok: true, payload: { type: 'storageBytes', value: storage.get(request.params.key) } }
        case 'writeStorage':
          storage.set(request.params.key, request.params.value)
          return { ok: true }
        case 'deleteStorage':
          storage.delete(request.params.key)
          return { ok: true }
        case 'listStorageKeys':
          return {
            ok: true,
            payload: {
              type: 'storageKeys',
              value: [...storage.keys()].filter(key => key.startsWith(request.params.prefix)),
            },
          }
        default:
          return {
            ok: false,
            error: {
              code: 'unsupportedOperation',
              message: `Unexpected bridge request "${request.method}".`,
            },
          }
      }
    })
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo('debug'),
      profileId: 'player-a',
    })

    await backend.saveSnapshot(createSnapshot('bridge-snapshot'))
    await expect(backend.getSnapshot('bridge-snapshot')).resolves.toEqual(expect.objectContaining({
      id: 'bridge-snapshot',
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
    }))
    await expect(backend.listSnapshots()).resolves.toEqual([
      expect.objectContaining({ id: 'bridge-snapshot' }),
    ])

    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'writeStorage',
        params: expect.objectContaining({
          key: 'dev.quajs.native.fixture/debug/player-a/qua-store/snapshots/bridge-snapshot',
        }),
      }),
      {
        method: 'readStorage',
        params: {
          key: 'dev.quajs.native.fixture/debug/player-a/qua-store/snapshots/bridge-snapshot',
        },
      },
      {
        method: 'listStorageKeys',
        params: {
          prefix: 'dev.quajs.native.fixture/debug/player-a/qua-store/snapshots/',
        },
      },
    ]))
  })

  it('persists save slot index, payload, and preview records through host storage', async () => {
    const host = createHost()
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo(),
      profileId: 'player-a',
    })
    const index = createSlotIndex('slot-1')
    const payload = createSlotPayload('slot-1')
    const preview = createPreview('slot-1')

    await backend.saveGameSlotIndex(index)
    await backend.saveGameSlotPayload(payload)
    await backend.saveGameSlotPreview(preview)

    const previewEnvelope = JSON.parse(new TextDecoder().decode(
      host.storage.get('dev.quajs.native.fixture/debug/player-a/qua-store/slot-previews/preview-slot-1')!,
    ))
    expect(previewEnvelope.record.bytes).toEqual({
      __quaType: 'Uint8Array',
      value: 'AQID',
    })
    expect(previewEnvelope.record.capturedAt).toBe(1782259200000)
    expect((await backend.getGameSlotIndex('slot-1'))!.timestamp).toBeInstanceOf(Date)
    expect((await backend.getGameSlotPayload('slot-1'))!.index.timestamp).toBeInstanceOf(Date)
    expect((await backend.getGameSlotPreview('preview-slot-1'))!.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(await backend.listGameSlotIndexes()).toEqual([
      expect.objectContaining({
        slotId: 'slot-1',
        timestamp: new Date('2026-06-24T00:00:00.000Z'),
      }),
    ])
  })

  it('clears snapshots and save slots by their native storage prefixes', async () => {
    const host = createHost()
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo(),
      profileId: 'player-a',
    })
    await backend.saveSnapshot(createSnapshot('s1'))
    await backend.saveSnapshot(createSnapshot('s2', 'ui'))
    await backend.saveGameSlotIndex(createSlotIndex('slot-1'))
    await backend.saveGameSlotPayload(createSlotPayload('slot-1'))
    await backend.saveGameSlotPreview(createPreview('slot-1'))

    await backend.clearSnapshots('engine')
    await backend.clearGameSlots()

    expect(await backend.getSnapshot('s1')).toBeUndefined()
    expect(await backend.getSnapshot('s2')).toBeDefined()
    expect(await backend.getGameSlotIndex('slot-1')).toBeUndefined()
    expect(await backend.getGameSlotPayload('slot-1')).toBeUndefined()
    expect(await backend.getGameSlotPreview('preview-slot-1')).toBeUndefined()
  })

  it('requires host key listing support for list and prefix clear operations', async () => {
    const host = createHost()
    host.listStorageKeys = undefined
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo(),
      profileId: 'player-a',
    })

    await backend.saveSnapshot(createSnapshot('s1'))

    await expect(backend.getSnapshot('s1')).resolves.toEqual(expect.objectContaining({ id: 's1' }))
    await expect(backend.listSnapshots()).rejects.toThrow(/must provide listStorageKeys/)
    await expect(backend.clearGameSlots()).rejects.toThrow(/must provide listStorageKeys/)
  })

  it('encodes record ids before using native host storage keys', async () => {
    const host = createHost()
    const backend = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo(),
      profileId: 'player-a',
    })

    await backend.saveSnapshot(createSnapshot('chapter/one snapshot'))

    expect(host.storage.has('dev.quajs.native.fixture/debug/player-a/qua-store/snapshots/chapter%2Fone%20snapshot')).toBe(true)
    expect(host.storage.has('dev.quajs.native.fixture/debug/player-a/qua-store/snapshots/chapter/one snapshot')).toBe(false)
  })

  it('isolates native storage namespace by bundle id, build profile, profile id, and namespace', async () => {
    const host = createHost()
    const debug = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo('debug'),
      profileId: 'player-a',
      namespace: 'save-data',
    })
    const release = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo('release'),
      profileId: 'player-a',
      namespace: 'save-data',
    })
    const otherProfile = new NativeStoreBackend({
      host,
      hostInfo: createHostInfo('debug'),
      profileId: 'player-b',
      namespace: 'save-data',
    })

    await debug.saveSnapshot(createSnapshot('s1'))

    expect(await release.getSnapshot('s1')).toBeUndefined()
    expect(await otherProfile.getSnapshot('s1')).toBeUndefined()
    expect(createNativeStoreNamespace({
      hostInfo: createHostInfo('release'),
      profileId: 'player-a',
      namespace: 'save-data',
    })).toBe('dev.quajs.native.fixture/release/player-a/save-data')
  })

  it('creates a StorageConfig for QuaStore injection', () => {
    const host = createHost()
    const middlewares = [{ beforeWrite: vi.fn() }]

    expect(createNativeStorageConfig({ host, middlewares })).toEqual({
      backend: {
        driver: NativeStoreBackend,
        options: {
          host,
          middlewares,
        },
      },
      middlewares,
    })
  })
})
