import { describe, expect, it, vi } from 'vitest'
import { createDevVfsProvider, DevVfsAssetProvider } from '../src/providers'

describe('devVfsAssetProvider', () => {
  it('should fetch manifest and assets from VFS endpoints', async () => {
    const fetcher = vi.fn((url: string) => {
      if (url === '/@qua-assets/manifest.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            version: '1',
            assets: [{
              id: 'dev:default:data:config.json',
              name: 'config.json',
              type: 'data',
              locale: 'default',
              path: 'data/config.json',
            }],
          }),
        })
      }

      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['{"ok":true}'], { type: 'application/json' })),
      })
    })

    const provider = new DevVfsAssetProvider({ fetcher: fetcher as any })

    await provider.init()
    const manifest = await provider.getManifest()
    const blob = await provider.getAsset('dev:default:data:config.json')

    expect(manifest.assets).toHaveLength(1)
    expect(await blob.text()).toBe('{"ok":true}')
    expect(fetcher).toHaveBeenCalledWith('/@qua-assets/data/config.json', { cache: 'no-cache' })
  })

  it('should update manifest records from HMR changes', async () => {
    const listeners = new Map<string, Function>()
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        version: '1',
        assets: [],
      }),
    })

    const provider = createDevVfsProvider({
      fetcher: fetcher as any,
      hmr: {
        on: (event, listener) => listeners.set(event, listener),
        off: event => listeners.delete(event),
      },
    })

    await provider.init()

    const received = vi.fn()
    provider.watch(received)

    const change = {
      type: 'added' as const,
      assetId: 'dev:default:images:bg.png',
      record: {
        id: 'dev:default:images:bg.png',
        name: 'bg.png',
        type: 'images' as const,
        locale: 'default',
        path: 'images/bg.png',
      },
      timestamp: Date.now(),
    }

    listeners.get('qua-assets:update')!(change)

    const manifest = await provider.getManifest()

    expect(received).toHaveBeenCalledWith(change)
    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0].id).toBe('dev:default:images:bg.png')
  })
})
