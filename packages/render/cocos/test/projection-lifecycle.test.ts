import type { AssetData, AssetType, QuaAssets } from '@quajs/assets'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { Pipeline } from '@quajs/pipeline'
import { SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { describe, expect, it, vi } from 'vitest'
import { QuaCocosRendererController } from '../src'
import { emptyCocosView } from '../src/defaults'
import { createAudioCocosRendererPlugin } from '../src/plugins/audio'
import { createBacklogCocosRendererPlugin } from '../src/plugins/backlog'
import { createFontsCocosRendererPlugin } from '../src/plugins/fonts'
import { createSettingsCocosRendererPlugin } from '../src/plugins/settings'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function flush() {
  for (let i = 0; i < 200; i++)
    await Promise.resolve()
}

function assets(source: string) {
  return {
    getAsset: async (type: AssetType, name: string): Promise<AssetData> => ({
      id: `${type}:${name}`,
      type,
      name,
      path: source,
      bundleName: 'base',
      locale: 'default',
      data: new Uint8Array([1]),
      size: 1,
      version: 1,
      mtime: 1,
      fromCache: false,
    }),
    on() {},
    off() {},
  } as unknown as QuaAssets
}

function settingsView(skinned = false) {
  const view = emptyCocosView()
  view.ui.overlays = { settings: { visible: true } }
  view.plugins.settings = { revision: 1, profileId: 'default', updatedAt: 1, scopes: {} }
  if (skinned)
    view.plugins.ui = { themeId: 'dark', defaults: { panel: 'panel' } }
  return view
}

describe('cocos projection lifecycle regressions', () => {
  it('does not update a disposed native handle after a pending seek completes', async () => {
    const host = createFakeCocosHost()
    const gate = deferred()
    const view = emptyCocosView()
    view.plugins.audio = { bgm: { id: 'main', kind: 'bgm', assetKey: 'seek.ogg' } }
    const renderer = new QuaCocosRendererController({ host, pipeline: new Pipeline(), assets: assets('audio'), initialView: view, plugins: [createAudioCocosRendererPlugin()] })
    await renderer.start()
    await flush()
    const handle = host.audioHandlesById.get('bgm:main')!
    const setVolume = vi.spyOn(handle, 'setVolume')
    handle.seek = async () => {
      await gate.promise
    }
    renderer.setView({ ...view, plugins: { audio: { bgm: { id: 'main', kind: 'bgm', assetKey: 'seek.ogg', seekMs: 500 } } } })
    await flush()
    await renderer.destroy()
    const calls = setVolume.mock.calls.length
    gate.resolve()
    await flush()
    expect(setVolume).toHaveBeenCalledTimes(calls)
    expect(host.resourcesById.size).toBe(0)
  })

  it.each(['create', 'play'] as const)('releases audio leases when native %s fails', async (failure) => {
    const host = createFakeCocosHost()
    const create = host.audio.createAudioHandle
    host.audio.createAudioHandle = async (...args) => {
      if (failure === 'create')
        throw new Error('Native create failed')
      const handle = await create(...args)
      handle.play = async () => {
        throw new Error('Native play failed')
      }
      return handle
    }
    const view = emptyCocosView()
    view.plugins.audio = { bgm: { id: 'main', kind: 'bgm', assetKey: 'failed.ogg' } }
    const pipeline = new Pipeline()
    const errors = vi.fn()
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, errors)
    const renderer = new QuaCocosRendererController({ host, pipeline, assets: assets('audio'), initialView: view, plugins: [createAudioCocosRendererPlugin()] })
    await renderer.start()
    await flush()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(host.resourcesById.size).toBe(0)
    renderer.setView(emptyCocosView())
    await flush()
    expect(host.resourcesById.size).toBe(0)
    await renderer.destroy()
  })

  it('pins audio bytes while native creation completes after teardown', async () => {
    const host = createFakeCocosHost()
    const gate = deferred()
    const create = host.audio.createAudioHandle
    host.audio.createAudioHandle = async (resource, options) => {
      await gate.promise
      expect(host.resourcesById.get(resource.id)).toBe(resource)
      return create(resource, options)
    }
    const view = emptyCocosView()
    view.plugins.audio = { bgm: { id: 'main', kind: 'bgm', assetKey: 'pending.ogg' } }
    const renderer = new QuaCocosRendererController({ host, pipeline: new Pipeline(), assets: assets('audio'), initialView: view, plugins: [createAudioCocosRendererPlugin()] })
    await renderer.start()
    await flush()
    await renderer.destroy()
    expect(host.resourcesById.size).toBe(1)
    gate.resolve()
    await flush()
    expect(host.resourcesById.size).toBe(0)
    expect(host.audioHandlesById.get('bgm:main')?.disposed).toBe(true)
  })

  it.each(['replace', 'remove', 'destroy'] as const)('keeps audio resources alive until native disposal finishes on %s', async (action) => {
    const host = createFakeCocosHost()
    const gate = deferred()
    const pipeline = new Pipeline()
    const view = emptyCocosView()
    view.plugins.audio = { bgm: { id: 'main', kind: 'bgm', assetKey: 'old.ogg', state: 'playing' } }
    const renderer = new QuaCocosRendererController({ host, pipeline, assets: assets('audio'), initialView: view, plugins: [createAudioCocosRendererPlugin()] })
    await renderer.start()
    await flush()
    const handle = host.audioHandlesById.get('bgm:main')!
    const resource = [...host.resourcesById.values()][0]!
    const stop = vi.spyOn(handle, 'stop').mockImplementation(async () => {
      await gate.promise
    })
    let destroy: Promise<void> | undefined
    if (action === 'destroy') {
      destroy = renderer.destroy()
    }
    else {
      const next = emptyCocosView()
      if (action === 'replace')
        next.plugins.audio = { bgm: { id: 'main', kind: 'bgm', assetKey: 'next.ogg', state: 'playing' } }
      renderer.setView(next)
    }
    await flush()
    expect(stop).toHaveBeenCalled()
    expect(handle.disposed).toBe(false)
    expect(host.resourcesById.get(resource.id)).toBe(resource)
    gate.resolve()
    await flush()
    await destroy
    expect(handle.disposed).toBe(true)
    expect(host.resourcesById.has(resource.id)).toBe(false)
    await renderer.destroy()
  })

  it('refreshes settings and backlog from public view setters and safe-area changes', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({ host, pipeline: new Pipeline(), plugins: [createSettingsCocosRendererPlugin(), createBacklogCocosRendererPlugin()] })
    await renderer.start()
    const view = settingsView()
    view.plugins.backlog = { visible: true, entries: [], retention: { scope: 'global', maxEntries: 50 } }
    renderer.setView(view)
    await flush()
    expect([...host.nodesById.values()].some(node => node.name === 'settings:title')).toBe(true)
    expect([...host.nodesById.values()].some(node => node.name === 'backlog:panel')).toBe(true)
    host.nodes.getSafeAreaInsets = () => ({ left: 240 })
    host.emitLayoutChange()
    await flush()
    expect([...host.nodesById.values()].find(node => node.name === 'backlog:panel')?.transform.x).toBe(240)
    renderer.setView(emptyCocosView())
    await flush()
    expect([...host.nodesById.values()].some(node => node.name === 'settings:title' || node.name === 'backlog:panel')).toBe(false)
    await renderer.destroy()
  })

  it.each(['close', 'destroy'] as const)('cancels a delayed settings skin on %s', async (action) => {
    const host = createFakeCocosHost()
    const gate = deferred()
    const runtimeAssets = assets('panel.png')
    runtimeAssets.getJSON = vi.fn(async () => {
      await gate.promise
      return { version: 1, family: 'ui/dark', skins: { panel: { base: { asset: 'panel.png' } } } }
    }) as QuaAssets['getJSON']
    const pipeline = new Pipeline()
    const errors = vi.fn()
    pipeline.on(RenderToLogicEvents.RENDER_ERROR, errors)
    const renderer = new QuaCocosRendererController({ host, pipeline, assets: runtimeAssets, initialView: settingsView(true), plugins: [createSettingsCocosRendererPlugin()] })
    const setSprite = vi.spyOn(host.nodes, 'setNodeSprite')
    await renderer.start()
    await flush()
    expect(runtimeAssets.getJSON).toHaveBeenCalled()
    if (action === 'destroy')
      await renderer.destroy()
    else
      await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: emptyCocosView() })
    gate.resolve()
    await flush()
    expect(setSprite).not.toHaveBeenCalled()
    expect([...host.nodesById.values()].some(node => node.name === 'settings:title')).toBe(false)
    expect(host.resourcesById.size).toBe(0)
    expect(errors).not.toHaveBeenCalled()
    await renderer.destroy()
  })

  it('does not reset settings through a higher interactive overlay', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const resets = vi.fn()
    pipeline.on(SettingsRenderToLogicEvents.RESET_ALL_REQUEST, resets)
    const renderer = new QuaCocosRendererController({ host, pipeline, initialView: settingsView(), plugins: [createSettingsCocosRendererPlugin()] })
    await renderer.start()
    await flush()
    const reset = [...host.nodesById.values()].find(node => node.name === 'settings:reset-all')!
    const panel = [...host.nodesById.values()].find(node => node.name === 'settings')!
    const overlay = host.nodes.createNode('overlay', { parent: host.root.children[0] })
    host.nodes.setNodeTransform(overlay, { width: 1920, height: 1080, zIndex: 99999999 })
    host.nodes.setNodeMetadata?.(overlay, { uiAction: 'panel' })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: panel.transform.x! + reset.transform.x! + 1, y: panel.transform.y! + reset.transform.y! + 1 })
    expect(resets).not.toHaveBeenCalled()
    await renderer.destroy()
  })

  it('reloads registered fonts after asset replacement and asset-change events', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const view = emptyCocosView()
    view.plugins.fonts = { faces: [{ id: 'main', family: 'Main', assetName: 'main.ttf' }] }
    const renderer = new QuaCocosRendererController({ host, pipeline, assets: assets('old.ttf'), initialView: view, plugins: [createFontsCocosRendererPlugin()] })
    const register = vi.spyOn(host.fonts!, 'registerFontFace')
    await renderer.start()
    await flush()
    renderer.setAssets(assets('new.ttf'))
    await flush()
    expect(host.fontFacesById.get('main')?.resource.source).toBe('new.ttf')
    await pipeline.emit(LogicToRenderEvents.ASSET_CHANGED, { type: 'fonts', name: 'main.ttf' })
    await flush()
    expect(register).toHaveBeenCalledTimes(3)
    await renderer.destroy()
    await flush()
    expect(host.resourcesById.size).toBe(0)
  })
})
