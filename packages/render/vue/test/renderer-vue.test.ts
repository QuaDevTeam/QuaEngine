import type { AssetData } from '@quajs/assets'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, isReadonly, nextTick } from 'vue'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { Pipeline } from '@quajs/pipeline'
import {
  LogicToRenderEvents,
  RenderToLogicEvents,
  emitLogicToRender,
  onRenderToLogic,
} from '@quajs/render-core'
import {
  QuaRenderer,
  useChoices,
  useQuaRenderer,
  useRendererActions,
  useAssetUrl,
} from '../src'
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
      getViewState: () => view({ dialogue: { visible: true, text: 'Initial' } }),
    })

    await flushVue()
    expect(received).toContain('ready')
    expect(host.el.textContent).toContain('Initial')

    host.app.unmount()
    await flushVue()

    expect(received).toContain('destroyed')
  })

  it('refreshes projection from engine state on pipeline view updates without mutating store', async () => {
    const pipeline = new Pipeline()
    let current = view({
      background: { assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Initial' },
    })
    const engine = {
      getPipeline: () => pipeline,
      getViewState: () => current,
      getAssets: () => undefined,
      getStore: () => ({ commit: vi.fn() }),
    }
    const host = mount(QuaRenderer, { engine }, {
      stage: ({ view: slotView }: any) => h('div', slotView.dialogue.text),
    })

    await flushVue()
    current = view({ dialogue: { visible: true, text: 'Updated' } })
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: current })
    await flushVue()

    expect(host.el.textContent).toBe('Updated')
    expect(engine.getStore().commit).not.toHaveBeenCalled()
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
      getViewState: () => view({ choices }),
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
      getViewState: () => view(),
    }, {
      stage: () => h(Probe),
    })

    await flushVue()
    host.el.querySelector('button')!.click()
    await flushVue()

    expect(received).toEqual([{ elementId: 'menu', config: { source: 'button' } }])
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
      getViewState: () => current,
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
      getViewState: () => current,
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
      background: { assetName: 'bg.png' },
      characters: [{ id: 'Alice', name: 'Alice', visible: true }],
      dialogue: { visible: true, text: 'Line' },
      choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      effects: [{ id: 'shake', type: 'shake' }],
    })
    const slotProbe = vi.fn(() => h('div', 'custom-bg'))

    const host = mount(QuaRenderer, {
      pipeline,
      getViewState: () => current,
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
      actions: expect.objectContaining({ advance: expect.any(Function) }),
    }))
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
      background: { assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Initial' },
    })
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: [plugin],
      getViewState: () => current,
    })

    await flushVue()
    expect(document.head.querySelector('style')?.textContent || '').not.toContain('.qua-renderer')
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toBeNull()
    expect(host.el.querySelector('.qua-character')?.getAttribute('style') || '').not.toContain('left:')

    current = view({
      background: { assetName: 'bg.png' },
      dialogue: { visible: true, text: 'Plugin refresh' },
    })
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: current })
    await flushVue()

    expect(host.el.textContent).toContain('Plugin refresh')
  })

  it('does not mount an empty default overlay layer over stage interactions', async () => {
    const pipeline = new Pipeline()
    const received: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => received.push(payload))
    const host = mount(QuaRenderer, {
      pipeline,
      getViewState: () => view(),
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
      getViewState: () => view(),
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
      getViewState: () => view(),
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
