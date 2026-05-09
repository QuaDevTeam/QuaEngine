import type { AssetData } from '@quajs/assets'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { createViteDevAssetRuntime } from '@quajs/assets-web'
import { Pipeline } from '@quajs/pipeline'
import {
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, isReadonly, nextTick } from 'vue'
import {
  QuaRenderer,
  useAssetUrl,
  useChoices,
  useQuaRenderer,
  useRendererActions,
} from '../src'
import { createVisualNovelRendererPlugins } from '../src/plugins/preset'
import { QuaMenuOverlay, QuaSettingsPanel, QuaUiOverlay } from '../src/plugins/ui'

describe('@quajs/renderer-vue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mounts, emits renderer lifecycle intents, and unsubscribes on unmount', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_READY, () => received.push('ready'))
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_DESTROYED, () => received.push('destroyed'))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({ dialogue: { visible: true, text: 'Initial' } }),
    })

    await flushVue()
    expect(received).toContain('ready')
    expect(host.el.textContent).toContain('Initial')

    host.app.unmount()
    await flushVue()

    expect(received).toContain('destroyed')
  })

  it('projects pipeline view updates without a browser-local engine', async () => {
    const pipeline = new Pipeline()
    const initialView = view({
      background: { mode: 'image', assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Initial' },
    })
    const host = mount(QuaRenderer, { pipeline, initialView }, {
      stage: ({ view: slotView }: any) => h('div', slotView.dialogue.text),
    })

    await flushVue()
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({ dialogue: { visible: true, text: 'Updated' } }),
    })
    await flushVue()

    expect(host.el.textContent).toBe('Updated')
  })

  it('provides readonly projections and intent-only actions to slots/composables', async () => {
    const pipeline = new Pipeline()
    const choices = [{ id: 'yes', text: 'Yes', enabled: true }]
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => received.push(payload.choiceId))

    const Probe = defineComponent({
      setup() {
        const choicesRef = useChoices()
        const actions = useRendererActions()
        const context = useQuaRenderer()
        expect(isReadonly(context.view.value)).toBe(true)
        expect(context.view.value.choices).toEqual(choices)
        expect((actions as any).setDialogue).toBeUndefined()
        expect((actions as any).openMenu).toBeUndefined()
        return () => h('button', {
          onClick: () => actions.selectChoice(choicesRef.value[0].id),
        }, choicesRef.value[0].text)
      },
    })

    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view({ choices }),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    host.el.querySelector('button')!.click()
    await flushVue()

    expect(received).toEqual(['yes'])
  })

  it('emits generic UI overlay intents without core menu/settings actions', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_OPEN, payload => received.push(payload))

    const Probe = defineComponent({
      setup() {
        const actions = useRendererActions()
        return () => h('button', {
          onClick: () => actions.requestUiOpen('menu', { source: 'button' }),
        }, 'open')
      },
    })

    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view(),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    host.el.querySelector('button')!.click()
    await flushVue()

    expect(received).toEqual([{ elementId: 'menu', config: { source: 'button' } }])
  })

  it('keeps visual feature layers opt-in through renderer plugins', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        characters: [{ id: 'Alice', name: 'Alice', visible: true, sprite: 'alice.png' }],
        dialogue: { visible: true, text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
        effects: [{ id: 'shake', type: 'shake' }],
      }),
    })

    await flushVue()

    expect(host.el.querySelector('.qua-stage')).not.toBeNull()
    expect(host.el.querySelector('.qua-background')).toBeNull()
    expect(host.el.querySelector('.qua-character')).toBeNull()
    expect(host.el.querySelector('.qua-dialogue-box')).toBeNull()
    expect(host.el.querySelector('.qua-choice-panel')).toBeNull()
    expect(host.el.querySelector('.qua-effect-layer')).toBeNull()
  })

  it('does not turn nested renderer or plugin UI clicks into duplicate advance intents', async () => {
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))
    const current = view({
      dialogue: { visible: true, text: 'Line' },
      choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      ui: {
        visible: true,
        overlays: {
          menu: { open: true },
        },
      },
    })

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    }, {
      overlay: () => h(QuaMenuOverlay, undefined, {
        default: () => h('button', { class: 'menu-action' }, 'menu'),
      }),
    })

    await flushVue()
    host.el.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()
    host.el.querySelector('.qua-choice-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()
    host.el.querySelector('.menu-action')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()
    host.el.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()

    expect(advances).toEqual([
      { source: 'dialogue' },
      { source: 'stage-click' },
    ])
  })

  it('keeps menu/settings panels in the UI plugin entry and reads generic overlays', async () => {
    const pipeline = new Pipeline()
    const current = view({
      ui: {
        visible: true,
        overlays: {
          menu: { open: true },
          settings: { open: true },
          custom: { label: 'Custom' },
        },
      },
    })

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    }, {
      stage: () => h('div', [
        h(QuaMenuOverlay, undefined, { default: () => 'menu' }),
        h(QuaSettingsPanel, undefined, { default: () => 'settings' }),
        h(QuaUiOverlay, { elementId: 'custom' }, { default: ({ overlay }: any) => String(overlay.label) }),
      ]),
    })

    await flushVue()

    expect(host.el.textContent).toContain('menu')
    expect(host.el.textContent).toContain('settings')
    expect(host.el.textContent).toContain('Custom')
  })

  it('passes full projection props to layer slots', async () => {
    const pipeline = new Pipeline()
    const current = view({
      background: { mode: 'image', assetName: 'bg.png' },
      characters: [{ id: 'Alice', name: 'Alice', visible: true }],
      dialogue: { visible: true, text: 'Line' },
      choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      effects: [{ id: 'shake', type: 'shake' }],
    })
    const slotProbe = vi.fn(() => h('div', 'custom-bg'))

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    }, {
      background: slotProbe,
    })

    await flushVue()

    expect(host.el.textContent).toContain('custom-bg')
    expect(slotProbe).toHaveBeenCalledWith(expect.objectContaining({
      view: current,
      background: current.background,
      characters: current.characters,
      dialogue: current.dialogue,
      choices: current.choices,
      audio: current.audio,
      effects: current.effects,
      animations: current.animations,
      actions: expect.objectContaining({ advance: expect.any(Function) }),
    }))
  })

  it('projects active animation tracks into default character and background rendering', async () => {
    const pipeline = new Pipeline()
    const timestamp = Date.now()
    const current = view({
      background: { mode: 'image', assetName: 'bg.png' },
      characters: [{
        id: 'Alice',
        name: 'Alice',
        visible: true,
        position: { x: 0, y: 50 },
      }],
      animations: [{
        id: 'animation:1',
        definitionId: 'scene.motion',
        state: 'paused',
        startedAt: timestamp - 500,
        pausedAt: timestamp,
        duration: 1000,
        playbackRate: 1,
        resolvedTracks: [
          {
            target: 'character:Alice',
            property: 'position.x',
            keyframes: [
              { at: 0, value: 0 },
              { at: 1000, value: 50 },
            ],
          },
          {
            target: 'background:main',
            property: 'x',
            keyframes: [
              { at: 0, value: 0 },
              { at: 1000, value: 20 },
            ],
          },
          {
            target: 'character:Missing',
            property: 'opacity',
            keyframes: [
              { at: 0, value: 0 },
              { at: 1000, value: 1 },
            ],
          },
        ],
      }],
    })

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    })

    await flushVue()

    expect(host.el.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 25')
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 10')
  })

  it('does not inject default visual styles and supports renderer plugins', async () => {
    const pipeline = new Pipeline()
    const plugin: RendererPlugin = {
      name: 'probe',
      setup(context) {
        context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => context.refresh()))
      },
    }
    let current = view({
      background: { mode: 'image', assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Initial' },
    })
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: [...createVisualNovelRendererPlugins(), plugin],
      initialView: current,
    })

    await flushVue()
    expect(document.head.querySelector('style')?.textContent || '').not.toContain('.qua-renderer')
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toBeNull()
    expect(host.el.querySelector('.qua-character')?.getAttribute('style') || '').not.toContain('left:')

    current = view({
      background: { mode: 'image', assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Plugin refresh' },
    })
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: current })
    await flushVue()

    expect(host.el.textContent).toContain('Plugin refresh')
  })

  it('renders video and layered background projections through the background plugin', async () => {
    const pipeline = new Pipeline()
    let current = view({
      background: {
        mode: 'video',
        assetName: 'rain.mp4',
        video: { assetName: 'rain.mp4', loop: true, muted: true, poster: 'rain.png' },
      },
    })

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    })

    await flushVue()

    expect(host.el.querySelector('.qua-background--video')).not.toBeNull()

    current = view({
      background: {
        mode: 'layered',
        layers: [
          { id: 'sky', assetName: 'sky.png', zIndex: 1 },
          { id: 'clouds', assetName: 'clouds.png', assetType: 'images', zIndex: 2 },
        ],
      },
      dialogue: { visible: true, text: 'Line' },
    })

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: current })

    await flushVue()

    expect(host.el.querySelectorAll('.qua-background-layer-item').length).toBe(2)
  })

  it('does not mount an empty default overlay layer over stage interactions', async () => {
    const pipeline = new Pipeline()
    const received: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => received.push(payload))
    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view(),
    })

    await flushVue()

    expect(host.el.querySelector('.qua-overlay-layer')).toBeNull()

    host.el.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()

    expect(received).toEqual([{ source: 'stage-click' }])
  })

  it('creates and revokes object URLs as renderer implementation state', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:asset')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [{
            id: 'memory:default:images:bg.png',
            name: 'bg.png',
            type: 'images',
            locale: 'default',
            path: 'images/bg.png',
          }],
        }),
        getAsset: async () => asset('bg.png', 'images', 'image/png'),
      },
    })
    await assets.initialize()

    const Probe = defineComponent({
      setup() {
        const handle = useAssetUrl('images', () => 'bg.png')
        return () => h('img', { src: handle.url.value })
      },
    })
    const host = mount(QuaRenderer, {
      pipeline: new Pipeline(),
      assets,
      initialView: view(),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    expect(create).toHaveBeenCalled()
    expect(host.el.querySelector('img')!.getAttribute('src')).toBe('blob:asset')

    host.app.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:asset')
    await assets.cleanup()
  })

  it('reloads object URLs on asset change events and ignores stale async loads', async () => {
    const createdUrls = ['blob:first', 'blob:second', 'blob:stale']
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => createdUrls.shift() || 'blob:extra')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let resolveFirst!: (asset: AssetData) => void
    let version = 0
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-race-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [{
            id: 'memory:default:images:bg.png',
            name: 'bg.png',
            type: 'images',
            locale: 'default',
            path: 'images/bg.png',
          }],
        }),
        getAsset: vi.fn(async () => {
          version += 1
          if (version === 1) {
            return await new Promise<AssetData>((resolve) => {
              resolveFirst = resolve
            })
          }
          return asset('bg.png', 'images', 'image/png')
        }),
      },
    })
    await assets.initialize()
    const pipeline = new Pipeline()

    const Probe = defineComponent({
      setup() {
        const handle = useAssetUrl('images', () => 'bg.png')
        return () => h('img', { src: handle.url.value })
      },
    })
    const host = mount(QuaRenderer, {
      pipeline,
      assets,
      initialView: view(),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    await emitLogicToRender(pipeline, LogicToRenderEvents.ASSET_CHANGED, {
      type: 'changed',
      assetId: 'memory:default:images:bg.png',
      timestamp: Date.now(),
    })
    await flushVue()

    expect(host.el.querySelector('img')!.getAttribute('src')).toBe('blob:first')
    resolveFirst(asset('bg.png', 'images', 'image/png'))
    await flushVue()

    expect(host.el.querySelector('img')!.getAttribute('src')).toBe('blob:first')
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledWith('blob:second')

    host.app.unmount()
    await assets.cleanup()
  })

  it('reloads object URLs when the local assets runtime reports asset changes', async () => {
    const createdUrls = ['blob:first', 'blob:changed']
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => createdUrls.shift() || 'blob:extra')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let notifyAssetChange!: (change: any) => void
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-local-asset-change-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [{
            id: 'memory:default:images:bg.png',
            name: 'bg.png',
            type: 'images',
            locale: 'default',
            path: 'images/bg.png',
          }],
        }),
        getAsset: vi.fn(async () => asset('bg.png', 'images', 'image/png')),
        watch: (listener) => {
          notifyAssetChange = listener
          return () => {}
        },
      },
    })
    await assets.initialize()

    const Probe = defineComponent({
      setup() {
        const handle = useAssetUrl('images', () => 'bg.png')
        return () => h('img', { src: handle.url.value })
      },
    })
    const host = mount(QuaRenderer, {
      pipeline: new Pipeline(),
      assets,
      initialView: view(),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    expect(host.el.querySelector('img')!.getAttribute('src')).toBe('blob:first')

    notifyAssetChange({
      type: 'changed',
      assetId: 'memory:default:images:bg.png',
      timestamp: Date.now(),
    })
    await flushVue()

    expect(host.el.querySelector('img')!.getAttribute('src')).toBe('blob:changed')
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledWith('blob:first')

    host.app.unmount()
    await assets.cleanup()
  })

  it('reloads projected background assets through the Vite dev VFS HMR path', async () => {
    const createdUrls = ['blob:bg:first', 'blob:bg:changed']
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => createdUrls.shift() || 'blob:bg:extra')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const listeners = new Map<string, (change: any) => void>()
    let backgroundFetches = 0
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/@qua-assets/manifest.json') {
        return webResponse(JSON.stringify({
          version: '1',
          assets: [devVfsBackgroundRecord()],
        }), 'application/json')
      }
      if (url === '/@qua-assets/images/bg.png') {
        backgroundFetches += 1
        return webResponse(backgroundFetches === 1 ? 'first' : 'changed', 'image/png')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const assets = await createViteDevAssetRuntime({
      fetcher: fetcher as unknown as typeof fetch,
      hmr: {
        on: (event, listener) => listeners.set(event, listener),
        off: event => listeners.delete(event),
      },
      web: {
        storage: new MemoryAssetStorage(),
      },
    })
    const host = mount(QuaRenderer, {
      pipeline: new Pipeline(),
      assets,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
      }),
    })

    await flushVue()
    expect(host.el.querySelector('.qua-background')?.getAttribute('src')).toBe('blob:bg:first')
    expect(backgroundFetches).toBe(1)

    listeners.get('qua-assets:update')!({
      type: 'changed',
      assetId: 'dev-vfs:default:images:bg.png',
      record: devVfsBackgroundRecord(),
      timestamp: Date.now(),
    })
    await flushVue()

    expect(host.el.querySelector('.qua-background')?.getAttribute('src')).toBe('blob:bg:changed')
    expect(backgroundFetches).toBe(2)
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledWith('blob:bg:first')

    host.app.unmount()
    await assets.cleanup()
  })
})

function mount(component: any, props: Record<string, unknown>, slots?: Record<string, any>) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () => h(component, props, slots),
  })
  app.mount(root)
  return { app, el: root }
}

async function flushVue(): Promise<void> {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

function view(overrides: Partial<QuaViewProjection> = {}): QuaViewProjection {
  return {
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true },
    effects: [],
    animations: [],
    audio: {
      volumeSettings: { master: 1, bgm: 1, sound: 1, voice: 1 },
      sounds: [],
      voices: [],
    },
    ...overrides,
  }
}

function asset(name: string, type: AssetData['type'], mimeType: string): AssetData {
  const data = new Uint8Array([1, 2, 3])
  return {
    id: `memory:default:${type}:${name}`,
    bundleName: 'memory',
    type,
    name,
    locale: 'default',
    data,
    mimeType,
    size: data.byteLength,
    version: 1,
    mtime: 1,
    fromCache: false,
  }
}

function webResponse(body: string, mimeType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': mimeType,
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  })
}

function devVfsBackgroundRecord() {
  return {
    id: 'dev-vfs:default:images:bg.png',
    bundleName: 'dev-vfs',
    name: 'bg.png',
    type: 'images' as const,
    locale: 'default',
    path: 'images/bg.png',
    mimeType: 'image/png',
  }
}
