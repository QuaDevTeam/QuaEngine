import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetRuntimeAdapter } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine, RenderToLogicEvents, UiOverlayPlugin, emitRenderToLogic, onLogicToRender, LogicToRenderEvents } from '../src'

describe('QuaEngine runtime architecture', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('requires explicit assets adapter injection', () => {
    expect(() => new QuaEngine()).toThrow('QuaEngine requires assets config with an adapter')
  })

  it('stores render-relevant state as the authoritative view projection', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setBackgroundProjection({ mode: 'image', assetName: 'bg.png', transition: { type: 'fade', duration: 300 } })
    await engine.showCharacter({ id: 'Alice', name: 'Alice', sprite: 'alice.png', position: { x: 40 } })
    await engine.showDialogue({ characterId: 'Alice', characterName: 'Alice', text: 'Hello' })
    await engine.showChoices([{ id: 'yes', text: 'Yes' }])
    await engine.playBGM('theme.ogg')
    await engine.setVolume('bgm', 0.5)
    await engine.sceneManager.showUI('menu', { open: true })
    await engine.sceneManager.applyEffect('shake', { target: 'stage', duration: 200 })

    const view = engine.getViewState()
    expect(view.background).toEqual({ mode: 'image', assetName: 'bg.png', transition: { type: 'fade', duration: 300 } })
    expect(view.characters).toEqual([expect.objectContaining({ id: 'Alice', visible: true, sprite: 'alice.png' })])
    expect(view.dialogue).toEqual(expect.objectContaining({ visible: true, text: 'Hello' }))
    expect(view.choices).toEqual([{ id: 'yes', text: 'Yes', enabled: true, metadata: undefined }])
    expect(view.audio.bgm).toEqual(expect.objectContaining({ assetName: 'theme.ogg', state: 'playing' }))
    expect(view.audio.volumeSettings.bgm).toBe(0.5)
    expect(view.ui.overlays).toEqual({ menu: { open: true } })
    expect(view.effects).toEqual([expect.objectContaining({ type: 'shake', target: 'stage' })])
  })

  it('returns view snapshots instead of mutable store references', async () => {
    const engine = createEngine()
    await engine.init()
    await engine.showDialogue({ text: 'Authoritative' })

    const projected = engine.getViewState() as any
    projected.dialogue.text = 'Mutated outside engine'
    projected.characters.push({ id: 'Injected', name: 'Injected', visible: true })
    projected.audio.sounds.push({
      id: 'external',
      assetName: 'external.ogg',
      volume: 1,
      loop: false,
      state: 'playing',
    })

    const next = engine.getViewState()
    expect(next.dialogue.text).toBe('Authoritative')
    expect(next.characters).toEqual([])
    expect(next.audio.sounds).toEqual([])
  })

  it('uses pipeline as the only render intent channel and waits for renderer events', async () => {
    const engine = createEngine()
    await engine.init()

    const wait = engine.waitFor(RenderToLogicEvents.USER_CHOICE_SELECT, payload => payload.choiceId === 'yes')
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId: 'yes' })

    await expect(wait).resolves.toEqual({ choiceId: 'yes' })
  })

  it('updates audio intent when renderer reports audio ended', async () => {
    const engine = createEngine()
    await engine.init()
    await engine.playSound('click.ogg', { id: 'click' })

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.AUDIO_ENDED, {
      channel: 'sound',
      id: 'click',
      assetName: 'click.ogg',
    })

    expect(engine.getViewState().audio.sounds).toEqual([])
  })

  it('exposes background projection writes on the engine instance', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setBackgroundProjection({ mode: 'image', assetName: 'bg.png' })
    expect(engine.getViewState().background).toEqual({ mode: 'image', assetName: 'bg.png' })

    await engine.setBackgroundProjection(undefined)
    expect(engine.getViewState().background).toBeUndefined()
  })

  it('stores animation projections in the engine-owned view lane', async () => {
    const engine = createEngine()
    await engine.init()

    await engine.setAnimationProjection({
      id: 'animation:1',
      definitionId: 'enter',
      state: 'running',
      startedAt: 1000,
      duration: 480,
      playbackRate: 1,
      resolvedTracks: [{
        target: 'character:Alice',
        property: 'position.x',
        keyframes: [{ at: 0, value: -180 }],
      }],
    })

    const projected = engine.getViewState() as any
    projected.animations[0].resolvedTracks[0].keyframes[0].value = 999

    expect(engine.getViewState().animations[0].resolvedTracks[0].keyframes[0].value).toBe(-180)

    await engine.removeAnimationProjection('animation:1')
    expect(engine.getViewState().animations).toEqual([])

    await engine.setAnimationProjection({
      id: 'animation:2',
      state: 'running',
      startedAt: 1000,
      duration: 100,
      playbackRate: 1,
      resolvedTracks: [],
    })
    await engine.clearAnimationProjections()
    expect(engine.getViewState().animations).toEqual([])
  })

  it('keeps scene lifecycle history and audio fade intent in engine-owned state', async () => {
    const engine = createEngine()
    await engine.init()
    const first = createScene('first')
    const second = createScene('second')

    await engine.loadScene(first)
    await engine.loadScene(second)
    await engine.playBGM('theme.ogg')
    await engine.soundSystem.fadeBGM(0.25, 300)

    expect(engine.sceneManager.getSceneHistory()).toEqual(['first'])
    expect(engine.getViewState().audio.bgm).toEqual(expect.objectContaining({
      volume: 0.25,
      state: 'fading',
    }))
  })

  it('routes GameManager load through engine load path and emits view updates', async () => {
    const engine = createEngine()
    await engine.init()
    const listener = vi.fn()
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.VIEW_UPDATE, listener)

    const store = engine.getStore()
    vi.spyOn(store, 'hasSlot').mockResolvedValue(true)
    vi.spyOn(store, 'loadFromSlot').mockResolvedValue(undefined)
    const loadFromSlot = vi.spyOn(engine, 'loadFromSlot')

    await engine.gameManager.loadGame('slot-1')

    expect(loadFromSlot).toHaveBeenCalledWith('slot-1', { force: true })
    expect(listener).toHaveBeenCalled()
  })

  it('forwards asset changes from runtime to renderer through pipeline', async () => {
    const adapter = createMemoryAdapter()
    const engine = new QuaEngine({
      assets: {
        adapter,
        provider: {
          mode: 'memory',
          getManifest: async () => ({ version: '1', assets: [] }),
          getAsset: async () => {
            throw new Error('unused')
          },
          watch(listener) {
            ;(adapter as any).__change = listener
            return () => {}
          },
        },
      },
    })
    const received: unknown[] = []
    onLogicToRender(engine.getPipeline(), LogicToRenderEvents.ASSET_CHANGED, payload => received.push(payload))

    await engine.init()
    const change = {
      type: 'changed' as const,
      assetId: 'dev-vfs:default:images:bg.png',
      timestamp: Date.now(),
    }
    ;(adapter as any).__change(change)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(received).toEqual([change])
  })

  it('handles overlay intents through an engine plugin', async () => {
    const engine = createEngine()
    engine.use(new UiOverlayPlugin())
    await engine.init()

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId: 'menu', config: { open: true } })
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId: 'settings', config: { open: true } })

    expect(engine.getViewState().ui.overlays).toEqual({
      menu: { open: true },
      settings: { open: true },
    })

    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId: 'menu' })
    await emitRenderToLogic(engine.getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId: 'settings' })

    expect(engine.getViewState().ui.overlays).toEqual({})
  })
})

function createEngine(): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
  })
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'engine-test-memory',
    storage: new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url) {
        throw new Error(`No test asset file registered: ${url}`)
      },
    },
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}

function createScene(name: string) {
  return {
    name,
    init: vi.fn(),
    run: vi.fn(),
    destroy: vi.fn(),
  }
}
