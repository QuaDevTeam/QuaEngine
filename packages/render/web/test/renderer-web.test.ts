import type { AchievementProjection } from '@quajs/plugin-achievement/contracts'
import type { GalleryProjection } from '@quajs/plugin-gallery/contracts'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { Pipeline } from '@quajs/pipeline'
import { ACHIEVEMENT_PLUGIN_ID, AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents,
  createInitialAudioProjection,
  onAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { FONTS_PLUGIN_ID } from '@quajs/plugin-fonts/contracts'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { SETTINGS_PLUGIN_ID, SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  characterProjectionVars,
  clientPointToStageLogical,
  collectTrackValues,
  createQuaWebDomRenderer,
  createQuaWebRendererController,
  createReactRendererStoreAdapter,
  createRendererInputController,
  projectAudioProjection,
  readCssSafeAreaInsets,
  resolveStageLayout,
  stageContentStyle,
  stageLogicalToClientPoint,
} from '../src'
import { WebAudioRendererController } from '../src/audio'
import { createGalleryProjectionModel, getGalleryProjectionFromView } from '../src/plugins/gallery'
import { createVisualNovelWebRendererPlugins } from '../src/plugins/preset'
import { WebSaveSlotPreviewCache } from '../src/save-preview'

describe('@quajs/renderer-web', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('resolves adaptive aspect-interval scaled stage layouts', () => {
    const landscape = createViewLayoutProjection('landscape')
    const tablet = resolveStageLayout(landscape, { width: 1600, height: 1000 })

    expect(tablet).toEqual(expect.objectContaining({
      viewportWidth: 1600,
      viewportHeight: 1000,
      viewportY: 0,
      logicalHeight: 1080,
    }))
    expect(tablet.logicalWidth).toBeCloseTo(1728)
    expect(tablet.aspectRatio).toBeCloseTo(16 / 10)
    expect(tablet.safeArea).toEqual(expect.objectContaining({
      x: 0,
      width: 1728,
    }))

    const ultrawide = resolveStageLayout(landscape, { width: 2560, height: 1080 })
    expect(ultrawide).toEqual(expect.objectContaining({
      viewportHeight: 1080,
      logicalHeight: 1080,
    }))
    expect(ultrawide.viewportWidth).toBeCloseTo(1920)
    expect(ultrawide.viewportX).toBeCloseTo(320)
    expect(ultrawide.logicalWidth).toBeCloseTo(1920)
    expect(ultrawide.aspectRatio).toBeCloseTo(16 / 9)
    expect(ultrawide.safeArea).toEqual(expect.objectContaining({
      x: 96,
      width: 1728,
    }))

    const portrait = createViewLayoutProjection('portrait')
    const phone = resolveStageLayout(portrait, { width: 360, height: 780 })
    expect(phone).toEqual(expect.objectContaining({
      viewportWidth: 360,
      viewportHeight: 780,
      viewportX: 0,
      viewportY: 0,
      logicalHeight: 2340,
    }))
    expect(phone.logicalWidth).toBeCloseTo(1080)
    expect(phone.aspectRatio).toBeCloseTo(9 / 19.5)

    const tallPhone = resolveStageLayout(portrait, { width: 360, height: 840 })
    expect(tallPhone.viewportWidth).toBeCloseTo(360)
    expect(tallPhone.viewportHeight).toBeCloseTo(840)
    expect(tallPhone.aspectRatio).toBeCloseTo(9 / 21)
  })

  it('converts client coordinates to logical stage coordinates across device ratios', () => {
    const landscape = createViewLayoutProjection('landscape')
    const tablet = resolveStageLayout(landscape, { width: 1600, height: 1000 })
    const tabletCenter = clientPointToStageLogical(tablet, { clientX: 800, clientY: 500 })

    expect(tabletCenter).toEqual(expect.objectContaining({
      insideViewport: true,
      insideStage: true,
    }))
    expect(tabletCenter.x).toBeCloseTo(864)
    expect(tabletCenter.y).toBeCloseTo(540)
    expect(stageLogicalToClientPoint(tablet, { x: 864, y: 540 })).toEqual({
      clientX: 800,
      clientY: 500,
    })

    const ultrawide = resolveStageLayout(landscape, { width: 2560, height: 1080 })
    const leftBar = clientPointToStageLogical(ultrawide, { clientX: 100, clientY: 100 })
    const viewportOrigin = clientPointToStageLogical(ultrawide, { clientX: 320, clientY: 0 })

    expect(leftBar.insideViewport).toBe(false)
    expect(leftBar.insideStage).toBe(false)
    expect(viewportOrigin).toEqual(expect.objectContaining({
      x: 0,
      y: 0,
      insideViewport: true,
      insideStage: true,
    }))

    const phone = resolveStageLayout(createViewLayoutProjection('portrait'), { width: 360, height: 780 })
    const phoneCenter = clientPointToStageLogical(phone, { clientX: 180, clientY: 390 })

    expect(phoneCenter.x).toBeCloseTo(540)
    expect(phoneCenter.y).toBeCloseTo(1170)
    expect(phoneCenter.insideStage).toBe(true)
    expect(stageLogicalToClientPoint(phone, { x: 540, y: 1170 })).toEqual({
      clientX: 180,
      clientY: 390,
    })
  })

  it('resolves DPR and CSS safe-area insets into logical stage safe areas', () => {
    const phone = resolveStageLayout(createViewLayoutProjection('portrait'), {
      width: 360,
      height: 780,
      devicePixelRatio: 3,
      safeAreaInsets: {
        top: 30,
        bottom: 15,
      },
    })

    expect(phone.devicePixelRatio).toBe(3)
    expect(phone.physicalScale).toBeCloseTo(1)
    expect(phone.physicalViewportWidth).toBeCloseTo(1080)
    expect(phone.physicalViewportHeight).toBeCloseTo(2340)
    expect(phone.logicalSafeAreaInsets).toEqual(expect.objectContaining({
      top: 90,
      bottom: 45,
      left: 0,
      right: 0,
    }))
    expect(phone.aspectSafeArea.x).toBeCloseTo(38.5714)
    expect(phone.aspectSafeArea.y).toBe(0)
    expect(phone.aspectSafeArea.width).toBeCloseTo(1002.8571)
    expect(phone.aspectSafeArea.height).toBe(2340)
    expect(phone.deviceSafeArea).toEqual(expect.objectContaining({
      x: 0,
      y: 90,
      width: 1080,
      height: 2205,
    }))
    expect(phone.safeArea.x).toBeCloseTo(38.5714)
    expect(phone.safeArea.y).toBe(90)
    expect(phone.safeArea.width).toBeCloseTo(1002.8571)
    expect(phone.safeArea.height).toBe(2205)

    const style = stageContentStyle(phone)
    expect(style['--qua-layout-device-pixel-ratio']).toBe(3)
    expect(style['--qua-layout-physical-scale']).toBe(1)
    expect(style['--qua-layout-css-safe-inset-top']).toBe('30px')
    expect(style['--qua-layout-safe-inset-top']).toBe(90)
    expect(style['--qua-layout-safe-y']).toBe(90)
    expect(style['--qua-layout-safe-center-x-px']).toBe('540px')
    expect(style['--qua-layout-safe-center-y-px']).toBe('1192.5px')

    expect(characterProjectionVars({ id: 'Alice', name: 'Alice', visible: true })?.['--qua-character-left'])
      .toBe('var(--qua-layout-safe-center-x-px, 50%)')
    expect(characterProjectionVars({ id: 'Alice', name: 'Alice', visible: true, position: { x: 100, y: 200 } })?.['--qua-character-left'])
      .toBe('100px')
  })

  it('reads CSS safe-area insets relative to the renderer container', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '30px',
      paddingRight: '12px',
      paddingBottom: '37px',
      paddingLeft: '8px',
    } as CSSStyleDeclaration)

    const element = document.createElement('div')
    document.body.append(element)
    const rectSpy = vi.spyOn(element, 'getBoundingClientRect')

    rectSpy.mockReturnValue(rectAt(0, 20, 390, 800))
    expect(readCssSafeAreaInsets(element)).toEqual({
      top: 10,
      right: 12,
      bottom: 13,
      left: 8,
    })

    rectSpy.mockReturnValue(rectAt(10, 40, 360, 740))
    expect(readCssSafeAreaInsets(element)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })

    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    try {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: {
          offsetLeft: 0,
          offsetTop: 0,
          width: 390,
          height: 600,
        },
      })
      rectSpy.mockReturnValue(rectAt(0, 0, 390, 844))
      expect(readCssSafeAreaInsets(element)).toEqual({
        top: 30,
        right: 12,
        bottom: 281,
        left: 8,
      })
    }
    finally {
      if (originalVisualViewport) {
        Object.defineProperty(window, 'visualViewport', originalVisualViewport)
      }
      else {
        delete (window as Partial<Window>).visualViewport
      }
    }
  })

  it('keeps full-stage background separate from safe-area content in native DOM rendering', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(780)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '30px',
      paddingRight: '0px',
      paddingBottom: '15px',
      paddingLeft: '0px',
    } as CSSStyleDeclaration)

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(360, 780))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        layout: createViewLayoutProjection('portrait'),
        background: { mode: 'image', assetName: 'bg.png' },
        dialogue: { visible: true, text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })

    await renderer.mount()

    const backgroundStyle = root.querySelector('.qua-stage-scene-content .qua-background')?.getAttribute('style') || ''
    const safeStyle = root.querySelector('.qua-stage-safe')?.getAttribute('style') || ''

    expect(backgroundStyle).toContain('inset: 0')
    expect(safeStyle).toContain('top: 90px')
    expect(safeStyle).toContain('height: 2205px')
    expect(root.querySelector('.qua-stage-safe .qua-dialogue-box')).not.toBeNull()
    expect(root.querySelector('.qua-stage-safe .qua-choice-panel')).not.toBeNull()

    await renderer.unmount()
  })

  it('rerenders native DOM layout when the mobile visual viewport changes', async () => {
    const visualViewport = new EventTarget()
    Object.defineProperty(window, 'visualViewport', {
      value: visualViewport,
      configurable: true,
    })
    let height = 780
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(360, height))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        layout: createViewLayoutProjection('portrait'),
        background: { mode: 'image', assetName: 'bg.png' },
      }),
    })

    await renderer.mount()
    expect(root.querySelector('.qua-stage-viewport')?.getAttribute('style')).toContain('height: 780px')
    expect(root.querySelector('.qua-stage')?.getAttribute('style')).toContain('width: 1080px')

    height = 840
    visualViewport.dispatchEvent(new Event('resize'))
    await flushDom()

    expect(root.querySelector('.qua-stage-viewport')?.getAttribute('style')).toContain('height: 840px')
    expect(root.querySelector('.qua-stage')?.getAttribute('style')).toContain('width: 1002.857')

    await renderer.unmount()
  })

  it('owns framework-neutral pipeline lifecycle and exposes external-store snapshots', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_READY, () => received.push('ready'))
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_DESTROYED, () => received.push('destroyed'))

    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view({ dialogue: { visible: true, text: 'Initial' } }),
    })
    const adapter = createReactRendererStoreAdapter(controller)
    let updates = 0
    const unsubscribe = adapter.subscribe(() => updates += 1)

    await controller.start()
    expect(received).toEqual(['ready'])
    expect(adapter.getSnapshot().view.dialogue.text).toBe('Initial')

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({ dialogue: { visible: true, text: 'Updated' } }),
    })

    expect(adapter.getSnapshot().view.dialogue.text).toBe('Updated')
    expect(updates).toBeGreaterThan(0)

    unsubscribe()
    await controller.destroy()
    expect(received).toEqual(['ready', 'destroyed'])
  })

  it('loads transient renderer plugins from runtime package events and destroys them on unload', async () => {
    const pipeline = new Pipeline()
    const setup = vi.fn()
    const destroy = vi.fn()
    const plugin: RendererPlugin = {
      name: 'runtime-renderer-plugin',
      setup,
      destroy,
    }
    const loader = vi.fn(async () => plugin)
    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view(),
      runtimePluginLoader: loader,
    })

    await controller.start()
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, {
      packageId: 'runtime.story',
      plugins: [{ id: 'runtime.renderer', kind: 'renderer', assetName: 'renderer.js' }],
    })
    await flushDom()
    expect(plugin.setup).toHaveBeenCalledTimes(1)

    expect(loader).toHaveBeenCalledWith(
      { id: 'runtime.renderer', kind: 'renderer', assetName: 'renderer.js' },
      { packageId: 'runtime.story' },
    )
    expect(setup).toHaveBeenCalledWith(expect.objectContaining({
      getPipeline: expect.any(Function),
      getViewState: expect.any(Function),
    }))

    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.story',
      bundleName: 'runtime.story',
    })
    await flushDom()

    expect(destroy).toHaveBeenCalledTimes(1)
    await controller.destroy()
  })

  it('waits for runtime renderer plugin cleanup before resolving unload events', async () => {
    const pipeline = new Pipeline()
    let resolveDestroy!: () => void
    const destroy = vi.fn(() => new Promise<void>((resolve) => {
      resolveDestroy = resolve
    }))
    const plugin: RendererPlugin = {
      name: 'runtime-renderer-plugin',
      setup: vi.fn(),
      destroy,
    }
    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view(),
      runtimePluginLoader: vi.fn(async () => plugin),
    })

    await controller.start()
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, {
      packageId: 'runtime.story',
      plugins: [{ id: 'runtime.renderer', kind: 'renderer', assetName: 'renderer.js' }],
    })
    await flushDom()

    let unloadResolved = false
    const unload = emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.story',
      bundleName: 'runtime.story',
    }).then(() => {
      unloadResolved = true
    })
    await flushDom()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(unloadResolved).toBe(false)

    resolveDestroy()
    await unload
    expect(unloadResolved).toBe(true)
    await controller.destroy()
  })

  it('ignores runtime renderer plugins that resolve after their package unloads', async () => {
    const pipeline = new Pipeline()
    const setup = vi.fn()
    const destroy = vi.fn()
    const plugin: RendererPlugin = {
      name: 'late-runtime-renderer-plugin',
      setup,
      destroy,
    }
    let resolveLoader!: (plugin: RendererPlugin) => void
    const loader = vi.fn(() => new Promise<RendererPlugin>((resolve) => {
      resolveLoader = resolve
    }))
    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view(),
      runtimePluginLoader: loader,
    })

    await controller.start()
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, {
      packageId: 'runtime.story',
      plugins: [{ id: 'runtime.renderer', kind: 'renderer', assetName: 'renderer.js' }],
    })
    expect(loader).toHaveBeenCalledTimes(1)

    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.story',
      bundleName: 'runtime.story',
    })
    resolveLoader(plugin)
    await flushDom()

    expect(setup).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
    await controller.destroy()
  })

  it('destroys partially initialized runtime renderer plugins when a later plugin fails to load', async () => {
    const pipeline = new Pipeline()
    const errors: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, payload => errors.push(payload))
    const setup = vi.fn()
    const destroy = vi.fn()
    const plugin: RendererPlugin = {
      name: 'partial-runtime-renderer-plugin',
      setup,
      destroy,
    }
    let callCount = 0
    const loader = vi.fn(async () => {
      callCount += 1
      if (callCount === 1) {
        return plugin
      }
      throw new Error('renderer plugin load failed')
    })
    const controller = createQuaWebRendererController({
      pipeline,
      initialView: view(),
      runtimePluginLoader: loader,
    })

    await controller.start()
    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_PLUGIN, {
      packageId: 'runtime.story',
      plugins: [
        { id: 'runtime.renderer.one', kind: 'renderer', assetName: 'one.js' },
        { id: 'runtime.renderer.two', kind: 'renderer', assetName: 'two.js' },
      ],
    })
    await flushDom()
    await flushDom()

    expect(setup).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('Failed to load runtime renderer plugins'),
        phase: 'runtime-renderer-plugin:load',
      }),
    ]))

    await emitLogicToRender(pipeline, LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD, {
      packageId: 'runtime.story',
      bundleName: 'runtime.story',
    })
    await flushDom()
    expect(destroy).toHaveBeenCalledTimes(1)
    await controller.destroy()
  })

  it('reports snapshot listener errors without stopping renderer updates', async () => {
    const pipeline = new Pipeline()
    const errors: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, payload => errors.push(payload))
    const controller = createQuaWebRendererController({ pipeline, initialView: view() })
    const healthy = vi.fn()
    controller.subscribe(() => {
      throw new Error('listener failed')
    })
    controller.subscribe(healthy)

    await controller.start()
    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({ dialogue: { visible: true, text: 'Still updates' } }),
    })
    await flushDom()

    expect(healthy).toHaveBeenCalled()
    expect(controller.getSnapshot().view.dialogue.text).toBe('Still updates')
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'Renderer snapshot listener failed.',
        phase: 'renderer:snapshot',
      }),
    ]))
    await controller.destroy()
  })

  it('reports DOM layer render errors while keeping other layers mounted', async () => {
    const pipeline = new Pipeline()
    const errors: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.RENDER_ERROR, payload => errors.push(payload))
    const root = document.createElement('div')
    root.style.width = '800px'
    root.style.height = '450px'
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      initialView: view(),
      plugins: [{
        name: 'faulty-dom-plugin',
        setup() {},
        layers: [{
          id: 'broken-layer',
          render() {
            throw new Error('layer exploded')
          },
        }, {
          id: 'healthy-layer',
          render(context) {
            const node = context.document.createElement('div')
            node.className = 'healthy-layer'
            return node
          },
        }],
      }],
    })

    await renderer.mount()
    await flushDom()

    expect(root.querySelector('.healthy-layer')).not.toBeNull()
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'DOM renderer layer "broken-layer" failed during render.',
        phase: 'dom-layer:render',
      }),
    ]))
    await renderer.unmount()
  })

  it('renders an opt-in native DOM visual novel projection and emits user intents', async () => {
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    const choices: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => choices.push(payload.choiceId))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        characters: [{ id: 'Alice', name: 'Alice', visible: true, position: { x: 10 } }],
        dialogue: { visible: true, characterName: 'Alice', text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-stage-viewport')?.getAttribute('style')).toContain('width: 1600px')
    expect(root.querySelector('.qua-stage')?.getAttribute('style')).toContain('width: 1728')
    expect(root.querySelector('.qua-stage-scene-content .qua-background')).not.toBeNull()
    expect(root.querySelector('.qua-stage-subject .qua-character')).not.toBeNull()
    expect(root.querySelector('.qua-stage-safe .qua-dialogue-box')).not.toBeNull()
    expect(root.querySelector('.qua-stage-safe .qua-choice-panel')).not.toBeNull()
    expect(root.querySelector('.qua-background')).not.toBeNull()
    expect(root.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 10')
    expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('Line')

    root.querySelector('.qua-choice-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    root.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushDom()

    expect(choices).toEqual(['yes'])
    expect(advances).toEqual([{ source: 'pointer:dialogue' }, { source: 'pointer:stage' }])

    await renderer.unmount()
  })

  it('reveals dialogue with a transient typewriter and consumes the first advance to complete it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          revision: 1,
          characterName: 'Alice',
          text: 'Hello',
          typewriter: { enabled: true, charactersPerSecond: 10 },
        },
      }),
    })

    await renderer.mount()
    try {
      expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('')

      await vi.advanceTimersByTimeAsync(100)
      expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('H')

      root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await flushMicrotasks()
      expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('Hello')
      expect(advances).toEqual([])

      root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await vi.advanceTimersByTimeAsync(0)
      await flushMicrotasks()
      expect(advances).toEqual([{ source: 'pointer:dialogue' }])
    }
    finally {
      await renderer.unmount()
    }
  })

  it('lets advance pass through when dialogue typewriter disables reveal-on-advance', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          revision: 1,
          text: 'Hello',
          typewriter: { enabled: true, charactersPerSecond: 10, revealOnAdvance: false },
        },
      }),
    })

    await renderer.mount()
    try {
      await vi.advanceTimersByTimeAsync(100)
      expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('H')

      root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await vi.advanceTimersByTimeAsync(0)
      await flushMicrotasks()

      expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('H')
      expect(advances).toEqual([{ source: 'pointer:dialogue' }])
    }
    finally {
      await renderer.unmount()
    }
  })

  it('plays transient typewriter sounds while revealing dialogue text', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:typewriter-click')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const play = vi.fn(() => Promise.resolve())
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = createElement(tagName, options)
      if (tagName.toLowerCase() === 'audio') {
        Object.defineProperty(element, 'play', { value: play })
      }
      return element
    })
    const assets = await createAudioAssets()
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      assets,
      pipeline: new Pipeline(),
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          revision: 1,
          text: 'Hi',
          typewriter: {
            enabled: true,
            charactersPerSecond: 10,
            sound: { assetKey: 'sfx/click.ogg', everyCharacters: 1, intervalMs: 0 },
          },
        },
      }),
    })

    await renderer.mount()
    try {
      await vi.advanceTimersByTimeAsync(100)
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(100)
      await flushMicrotasks()

      expect(createUrl).toHaveBeenCalled()
      expect(play).toHaveBeenCalledTimes(1)
    }
    finally {
      await renderer.unmount()
      await assets.cleanup()
    }
  })

  it('resolves gallery projections from view plugins', () => {
    const projection = galleryProjection()
    const current = view({
      plugins: {
        [GALLERY_PLUGIN_ID]: projection,
      },
    })

    expect(getGalleryProjectionFromView(current)).toBe(projection)
    const model = createGalleryProjectionModel(projection)
    expect(model?.selectedCatalog?.id).toBe('cg')
    expect(model?.selectedEntry?.id).toBe('cg.sunset')
    expect(model?.selectedContent?.id).toBe('cg.sunset.text')
    expect(model?.filteredEntries.map(entry => entry.id)).toEqual(['cg.sunset', 'cg.night'])
  })

  it('renders gallery scene UI and emits gallery plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, context => received.push({
      type: 'entry',
      payload: context.event.payload,
    }))
    pipeline.on(GalleryRenderToLogicEvents.CLOSE_REQUEST, context => received.push({
      type: 'close',
      payload: context.event.payload,
    }))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        plugins: {
          [GALLERY_PLUGIN_ID]: galleryProjection(),
        },
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-gallery-layer')).not.toBeNull()
    expect(root.querySelector('.qua-gallery-panel')?.textContent).toContain('CG')
    expect(root.querySelector('.qua-gallery-panel')?.textContent).toContain('Sunset')

    root.querySelector<HTMLButtonElement>('[data-gallery-entry-id="cg.night"]')!.click()
    root.querySelector<HTMLButtonElement>('.qua-gallery-close')!.click()
    await flushDom()

    expect(received).toEqual([
      { type: 'entry', payload: { entryId: 'cg.night' } },
      { type: 'close', payload: {} },
    ])

    await renderer.unmount()
  })

  it('renders achievement board and toast UI and emits achievement plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, context => received.push({
      type: 'filter',
      payload: context.event.payload,
    }))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, context => received.push({
      type: 'group',
      payload: context.event.payload,
    }))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, context => received.push({
      type: 'achievement',
      payload: context.event.payload,
    }))
    pipeline.on(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, context => received.push({
      type: 'dismiss',
      payload: context.event.payload,
    }))
    pipeline.on(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, context => received.push({
      type: 'close',
      payload: context.event.payload,
    }))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        plugins: {
          [ACHIEVEMENT_PLUGIN_ID]: achievementProjection(),
        },
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-achievement-layer')).not.toBeNull()
    expect(root.querySelector('.qua-achievement-toast-layer')).not.toBeNull()
    expect(root.textContent).toContain('Achievements')
    expect(root.textContent).toContain('First Step')

    const search = root.querySelector<HTMLInputElement>('.qua-achievement-search-input')!
    search.value = 'cg'
    search.dispatchEvent(new Event('input'))
    root.querySelector<HTMLButtonElement>('[data-achievement-group-id="side"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-achievement-id="cg.master"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-achievement-notification-id="toast-1"]')!.click()
    root.querySelector<HTMLButtonElement>('.qua-achievement-close')!.click()
    await flushDom()

    expect(received).toEqual(expect.arrayContaining([
      { type: 'filter', payload: { filter: { search: 'cg' } } },
      { type: 'group', payload: { groupId: 'side' } },
      { type: 'achievement', payload: { achievementId: 'cg.master' } },
      { type: 'dismiss', payload: { notificationId: 'toast-1' } },
      { type: 'close', payload: {} },
    ]))

    await renderer.unmount()
  })

  it('maps keyboard input commands to built-in renderer intents', async () => {
    const pipeline = new Pipeline()
    const events: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => events.push(`command:${payload.command}:${payload.source}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => events.push(`advance:${payload.source}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.FLOW_CONTROL_START_SKIP_REQUEST, payload => events.push(`skip:start:${payload.source}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.FLOW_CONTROL_STOP_SKIP_REQUEST, payload => events.push(`skip:stop:${payload.source}`))

    const controller = createQuaWebRendererController({ pipeline })
    const input = createRendererInputController({
      actions: controller.actions,
      getViewState: () => controller.getViewState(),
      target: document,
      gamepad: false,
      pointer: false,
    })
    input.start()

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft', key: 'Control', bubbles: true }))
    await flushDom()

    expect(events).toEqual([
      'command:advance:keyboard:Enter',
      'advance:keyboard:Enter',
      'command:skip:start:keyboard:ControlLeft',
      'skip:start:keyboard:ControlLeft',
      'command:skip:stop:keyboard:ControlLeft',
      'skip:stop:keyboard:ControlLeft',
    ])

    input.dispose()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))
    await flushDom()
    expect(events).toHaveLength(6)
  })

  it('emits window focus and blur intents from renderer focus tracking', async () => {
    const pipeline = new Pipeline()
    const events: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.WINDOW_BLUR, () => events.push('blur'))
    onRenderToLogic(pipeline, RenderToLogicEvents.WINDOW_FOCUS, () => events.push('focus'))

    const controller = createQuaWebRendererController({ pipeline })
    const input = createRendererInputController({
      actions: controller.actions,
      getViewState: () => controller.getViewState(),
      target: document,
      gamepad: false,
      keyboard: false,
      pointer: false,
      wheel: false,
    })
    input.start()

    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    await flushDom()

    expect(events).toEqual(['blur', 'focus'])

    input.dispose()
  })

  it('maps pointer input through logical stage coordinates and filters controls', async () => {
    const pipeline = new Pipeline()
    const commands: unknown[] = []
    const advances: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => commands.push(payload))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: { visible: true, text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })

    await renderer.mount()
    root.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 800, clientY: 500 }))
    root.querySelector('.qua-choice-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 800, clientY: 500 }))
    await flushDom()

    expect(advances).toEqual([{ source: 'pointer:stage' }])
    expect(commands).toEqual([expect.objectContaining({
      command: 'advance',
      device: 'pointer',
      source: 'pointer:stage',
      metadata: expect.objectContaining({
        x: expect.closeTo(864),
        y: expect.closeTo(540),
        insideStage: true,
      }),
    })])

    await renderer.unmount()
  })

  it('keeps choice navigation as renderer-local focus before confirming selection', async () => {
    const pipeline = new Pipeline()
    const selected: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, payload => selected.push(payload.choiceId))
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins({ input: { pointer: false, gamepad: false } }),
      initialView: view({
        choices: [
          { id: 'yes', text: 'Yes', enabled: true },
          { id: 'no', text: 'No', enabled: true },
        ],
      }),
    })

    await renderer.mount()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true }))
    await flushDom()
    expect(document.activeElement).toBe(root.querySelector('[data-choice-id="yes"]'))
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true }))
    await flushDom()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true }))
    await flushDom()
    expect(document.activeElement).toBe(root.querySelector('[data-choice-id="no"]'))

    expect(selected).toEqual([])
    const input = createRendererInputController({
      actions: renderer.controller.actions,
      getViewState: () => renderer.controller.getViewState(),
      includeDefaultBindings: false,
      keyboard: false,
      pointer: false,
      gamepad: false,
    })
    input.start()
    await input.dispatchCommand({ command: 'choice:confirm', device: 'keyboard', source: 'keyboard:Enter' })
    expect(selected).toEqual(['no'])
    input.dispose()

    await renderer.unmount()
  })

  it('supports wheel bindings without making wheel a default advance input', async () => {
    const pipeline = new Pipeline()
    const commands: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => commands.push(`${payload.command}:${payload.source}`))
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins({
        input: {
          keyboard: false,
          pointer: false,
          gamepad: false,
          bindings: [{ source: 'wheel', direction: 'down', command: 'choice:next', throttleMs: 0 }],
        },
      }),
      initialView: view(),
    })

    await renderer.mount()
    root.querySelector('.qua-stage')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 }))
    await flushDom()

    expect(commands).toEqual(['choice:next:wheel:down'])

    await renderer.unmount()
  })

  it('maps gamepad edge changes to semantic commands and stops polling after dispose', async () => {
    vi.useFakeTimers()
    try {
      const pipeline = new Pipeline()
      const received: string[] = []
      const stopReceived = new Promise<void>((resolve) => {
        onRenderToLogic(pipeline, RenderToLogicEvents.FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST, () => resolve())
      })
      const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }))
      const gamepad = { index: 0, id: 'pad', buttons } as Gamepad
      Object.defineProperty(window.navigator, 'getGamepads', {
        configurable: true,
        value: vi.fn(() => [gamepad]),
      })
      onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => received.push(`${payload.command}:${payload.source}:${payload.pressed}`))
      onRenderToLogic(pipeline, RenderToLogicEvents.FLOW_CONTROL_START_FAST_FORWARD_REQUEST, payload => received.push(`start:${payload.source}`))
      onRenderToLogic(pipeline, RenderToLogicEvents.FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST, payload => received.push(`stop:${payload.source}`))
      const controller = createQuaWebRendererController({ pipeline })
      const input = createRendererInputController({
        actions: controller.actions,
        getViewState: () => controller.getViewState(),
        keyboard: false,
        pointer: false,
        focusTracking: false,
        gamepadPollIntervalMs: 10,
      })

      input.start()
      buttons[5] = { pressed: true, value: 1 } as GamepadButton
      vi.advanceTimersByTime(10)
      await waitForMicrotasks(() => received.length >= 2)
      buttons[5] = { pressed: false, value: 0 } as GamepadButton
      vi.advanceTimersByTime(10)
      await stopReceived
      input.dispose()
      buttons[5] = { pressed: true, value: 1 } as GamepadButton
      vi.advanceTimersByTime(20)
      await waitForMicrotasks(() => received.length > 4)

      expect(received).toEqual([
        'fastForward:start:gamepad:0:button:5:true',
        'start:gamepad:0:button:5',
        'fastForward:stop:gamepad:0:button:5:false',
        'stop:gamepad:0:button:5',
      ])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('renders native DOM schema-driven settings forms and emits settings update intents', async () => {
    const pipeline = new Pipeline()
    const updates: unknown[] = []
    pipeline.on(SettingsRenderToLogicEvents.UPDATE_REQUEST, context => updates.push(context.event.payload))

    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 1000))
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            settings: { open: true },
          },
        },
        plugins: {
          [SETTINGS_PLUGIN_ID]: settingsProjection(),
        },
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-settings-panel')).not.toBeNull()
    expect(root.textContent).toContain('System')
    expect(root.textContent).toContain('Text Speed')

    const textSpeed = root.querySelector<HTMLInputElement>('[data-settings-field="textSpeedCps"] input')
    textSpeed!.value = '72'
    textSpeed!.dispatchEvent(new Event('input'))
    await flushDom()
    expect(updates).toEqual([])

    textSpeed!.dispatchEvent(new Event('change'))
    await flushDom()

    const skipMode = root.querySelector<HTMLSelectElement>('[data-settings-field="skipMode"] select')
    skipMode!.value = JSON.stringify('all')
    skipMode!.dispatchEvent(new Event('change'))
    await flushDom()

    const layout = root.querySelector<HTMLTextAreaElement>('[data-settings-field="layout"] textarea')
    layout!.value = JSON.stringify({ gap: 16 })
    layout!.dispatchEvent(new Event('change'))
    await flushDom()

    const custom = root.querySelector<HTMLElement>('[data-settings-field="shader"] .qua-settings-custom-control')
    expect(custom?.getAttribute('data-settings-component')).toBe('ShaderPicker')
    expect(root.querySelector('[data-settings-field="shader"] input')).toBeNull()

    expect(updates).toEqual([
      { scope: 'system', patch: { textSpeedCps: 72 } },
      { scope: 'system', patch: { skipMode: 'all' } },
      { scope: 'system', patch: { layout: { gap: 16 } } },
    ])

    await renderer.unmount()
  })

  it('projects rich dialogue text typography through animation tracks', async () => {
    vi.useFakeTimers({ now: 1500 })
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          text: {
            kind: 'rich-text',
            blocks: [{
              id: 'line',
              spans: [
                { text: 'Hello ' },
                { id: 'keyword', text: 'World', color: '#000000', fontSize: 20, fontWeight: 400 },
              ],
            }],
          },
        },
        animations: [{
          id: 'animation:rich-text',
          state: 'running',
          startedAt: 1000,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            { target: 'richTextSpan:dialogue:keyword', property: 'color', interpolation: 'color', keyframes: [{ at: 0, value: '#000000' }, { at: 1000, value: '#ffffff' }] },
            { target: 'richTextSpan:dialogue:keyword', property: 'fontSize', keyframes: [{ at: 0, value: 20 }, { at: 1000, value: 40 }] },
            { target: 'richTextSpan:dialogue:keyword', property: 'fontWeight', keyframes: [{ at: 0, value: 400 }, { at: 1000, value: 700 }] },
          ],
        }],
      }),
    })

    await renderer.mount()

    const span = root.querySelector<HTMLElement>('[data-rich-text-span-id="keyword"]')
    expect(root.querySelector('.qua-dialogue-text')?.textContent).toBe('Hello World')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-color: rgb(128, 128, 128)')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-font-size: 30px')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-font-weight: 550')

    await renderer.unmount()
    vi.useRealTimers()
  })

  it('registers font assets for rich dialogue typography through the Web preset', async () => {
    const fontRuntime = installFakeFontFace()
    const assets = await createFontAssets()
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        plugins: {
          [FONTS_PLUGIN_ID]: {
            revision: 1,
            faces: [{
              family: 'Qua Serif',
              assetName: 'display.woff2',
              weight: 700,
              display: 'swap',
            }],
          },
        },
        dialogue: {
          visible: true,
          text: {
            kind: 'rich-text',
            fontFamily: 'Qua Serif',
            blocks: [{
              spans: [{ text: 'Loaded font' }],
            }],
          },
        },
      }),
    })

    try {
      await renderer.mount()
      await flushDom()

      expect(fontRuntime.created).toHaveLength(1)
      expect(fontRuntime.created[0]).toEqual(expect.objectContaining({
        family: 'Qua Serif',
        descriptors: expect.objectContaining({
          weight: '700',
          display: 'swap',
        }),
      }))
      expect(fontRuntime.add).toHaveBeenCalledWith(fontRuntime.created[0])
      expect(root.querySelector('.qua-dialogue-text')?.getAttribute('style')).toContain('--qua-rich-text-font-family: Qua Serif')

      await renderer.unmount()
      expect(fontRuntime.delete).toHaveBeenCalledWith(fontRuntime.created[0])
    }
    finally {
      fontRuntime.restore()
      await assets.cleanup()
    }
  })

  it('resolves font assets through required runtime package candidates', async () => {
    const fontRuntime = installFakeFontFace()
    const requestedPackages: Array<string | undefined> = []
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-runtime-font-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            fontManifestRecord('base-display', 'display.woff2', 'runtime.font-base', 1),
            fontManifestRecord('delta-display', 'display.woff2', 'runtime.font-delta', 100),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedPackages.push(record?.runtimePackageId)
          return new Uint8Array([1, 2, 3, 4])
        },
      },
    })
    await assets.initialize()
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        plugins: {
          [FONTS_PLUGIN_ID]: {
            revision: 1,
            faces: [{
              family: 'Qua Serif',
              assetName: 'display.woff2',
              contentPackageId: 'runtime.font-base',
              metadata: {
                requiredRuntimePackages: ['runtime.font-base', 'runtime.font-delta'],
              },
            }],
          },
        },
      }),
    })

    try {
      await renderer.mount()
      await flushDom()

      expect(requestedPackages).toEqual(['runtime.font-delta'])
      expect(fontRuntime.created).toHaveLength(1)

      await renderer.unmount()
    }
    finally {
      fontRuntime.restore()
      await assets.cleanup()
    }
  })

  it('renders default scene transition overlays and emits scene readiness', async () => {
    vi.useFakeTimers({ now: 1000 })
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)
    try {
      const pipeline = new Pipeline()
      const readyScenes: string[] = []
      onRenderToLogic(pipeline, RenderToLogicEvents.SCENE_READY, payload => readyScenes.push(payload.sceneId || ''))

      const root = document.createElement('div')
      document.body.append(root)
      vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 900))
      const renderer = createQuaWebDomRenderer({
        container: root,
        pipeline,
        plugins: createVisualNovelWebRendererPlugins(),
        initialView: view(),
      })

      await renderer.mount()
      await emitLogicToRender(pipeline, LogicToRenderEvents.SCENE_CHANGE, {
        toScene: 'intro',
        transition: { type: 'fade', duration: 64, easing: 'linear' },
      })

      expect(root.querySelector('.qua-scene-transition')?.getAttribute('data-scene-transition-type')).toBe('fade')
      expect(root.querySelector<HTMLElement>('.qua-scene-transition')?.style.opacity).toBe('1')

      await vi.advanceTimersByTimeAsync(32)
      expect(Number(root.querySelector<HTMLElement>('.qua-scene-transition')?.style.opacity)).toBeLessThan(1)

      await vi.advanceTimersByTimeAsync(64)
      expect(root.querySelector('.qua-scene-transition')).toBeNull()
      expect(readyScenes).toEqual(['intro'])

      await renderer.unmount()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('renders layered background composition inside the adaptive stage', async () => {
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: {
          mode: 'layered',
          layers: [{
            id: 'fog',
            assetName: 'fog.png',
            zIndex: 3,
            composition: {
              blendMode: 'screen',
              filter: { blur: 4, brightness: 1.2 },
              mask: { assetName: 'fog-mask.png', position: 'center', size: 'cover' },
            },
          }],
        },
      }),
    })

    await renderer.mount()

    const item = root.querySelector<HTMLElement>('[data-background-layer-id="fog"]')
    expect(item).not.toBeNull()
    expect(item?.getAttribute('style')).toContain('inset: 0')
    expect(item?.getAttribute('style')).toContain('width: 100%')
    expect(item?.getAttribute('style')).toContain('--qua-background-layer-blend-mode: screen')
    expect(item?.getAttribute('style')).toContain('filter: blur(4px) brightness(1.2)')
    expect(item?.getAttribute('style')).toContain('mask-position: center')

    await renderer.unmount()
  })

  it('renders backlog projection and emits backlog plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(BacklogRenderToLogicEvents.JUMP_REQUEST, context => received.push(context.event.payload))

    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        plugins: {
          [BACKLOG_PLUGIN_ID]: {
            revision: 1,
            visible: true,
            retention: { scope: 'chapter', maxEntries: 200 },
            defaultPolicy: { include: true, rewindable: true, voiceReplay: true },
            entries: [{
              id: 'entry-1',
              kind: 'dialogue',
              speaker: 'Alice',
              text: 'Backlog line',
              checkpointId: 'checkpoint-1',
              rewindable: true,
              voiceReplay: false,
              timestamp: Date.now(),
            }],
          },
        },
      }),
    })

    await renderer.mount()
    expect(root.querySelector('.qua-backlog-entry-main')?.textContent).toContain('Backlog line')
    root.querySelector<HTMLButtonElement>('.qua-backlog-entry-main')!.click()
    await flushDom()
    expect(received).toEqual([{ entryId: 'entry-1' }])

    await renderer.unmount()
  })

  it('projects active character/background animations in native DOM layers', async () => {
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const timestamp = Date.now()
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          position: { x: 0, y: 50 },
        }],
        animations: [{
          id: 'animation:1',
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
          ],
        }],
      }),
    })

    await renderer.mount()

    expect(root.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 25')
    expect(root.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 10')

    await renderer.unmount()
  })

  it('projects stage, dialogue, choices, effects, and audio animation targets', async () => {
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const timestamp = Date.now()
    const current = view({
      dialogue: { visible: true, text: 'Animated line' },
      choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      effects: [{ id: 'flash', type: 'flash' }],
      plugins: {
        dialogue: { y: 8 },
        choices: {
          x: 2,
          choices: {
            yes: { y: 3 },
          },
        },
        [AUDIO_PLUGIN_ID]: {
          ...createInitialAudioProjection(),
          buses: {
            ...createInitialAudioProjection().buses,
            master: { gainDb: 0 },
          },
        },
      },
      animations: [{
        id: 'animation:projection-targets',
        state: 'paused',
        startedAt: timestamp - 500,
        pausedAt: timestamp,
        duration: 1000,
        playbackRate: 1,
        resolvedTracks: [
          { target: 'stage:main', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 20 }] },
          { target: 'dialogue:box', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
          { target: 'choices:panel', property: 'y', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 10 }] },
          { target: 'choice:yes', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
          { target: 'effect:flash', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
          { target: 'audioBus:master', property: 'gainDb', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: -12 }] },
        ],
      }],
    })
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: current,
    })

    await renderer.mount()

    expect(root.querySelector('.qua-stage')?.getAttribute('style')).not.toContain('--qua-stage-x')
    expect(root.querySelector('.qua-stage-scene')?.getAttribute('style')).toContain('--qua-stage-x: 10')
    expect(root.querySelector('.qua-dialogue-box')?.getAttribute('style')).toContain('--qua-dialogue-opacity: 0.5')
    expect(root.querySelector('.qua-dialogue-box')?.getAttribute('style')).toContain('--qua-dialogue-y: 8')
    expect(root.querySelector('.qua-dialogue-box')?.getAttribute('style')).not.toContain('background-color')
    expect(root.querySelector('.qua-choice-panel')?.getAttribute('style')).toContain('--qua-choices-x: 2')
    expect(root.querySelector('.qua-choice-panel')?.getAttribute('style')).toContain('--qua-choices-y: 5')
    expect(root.querySelector('.qua-choice-button')?.getAttribute('style')).toContain('--qua-choice-y: 3')
    expect(root.querySelector('.qua-choice-button')?.getAttribute('style')).toContain('--qua-choice-opacity: 0.5')
    expect(root.querySelector('.qua-effect')?.getAttribute('style')).toContain('--qua-effect-opacity: 0.5')
    expect(projectAudioProjection<any>(current, timestamp)?.buses.master.gainDb).toBe(-6)

    await renderer.unmount()
  })

  it('samples delayed, directed, eased, color, and vector animation tracks', () => {
    const animation = {
      id: 'animation:interpolation',
      state: 'running' as const,
      startedAt: 1000,
      duration: 1000,
      delay: 100,
      playbackRate: 1,
      direction: 'normal' as const,
      fill: 'backwards' as const,
      resolvedTracks: [
        { target: 'target:one', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 100, easing: 'ease-in' }] },
        { target: 'target:one', property: 'color', interpolation: 'color' as const, keyframes: [{ at: 0, value: '#000000' }, { at: 1000, value: '#ffffff' }] },
        { target: 'target:one', property: 'offset', interpolation: 'vector' as const, keyframes: [{ at: 0, value: { x: 0, y: 10 } }, { at: 1000, value: { x: 10, y: 20 } }] },
      ],
    }

    expect(collectTrackValues([animation], 'target:one', 1050).find(track => track.property === 'x')?.value).toBe(0)
    const values = collectTrackValues([animation], 'target:one', 1600)
    expect(values.find(track => track.property === 'x')?.value).toBe(25)
    expect(values.find(track => track.property === 'color')?.value).toBe('rgb(128, 128, 128)')
    expect(values.find(track => track.property === 'offset')?.value).toEqual({ x: 5, y: 15 })

    const stepAnimation = {
      id: 'animation:step-boundary',
      state: 'running' as const,
      startedAt: 1000,
      duration: 1000,
      playbackRate: 1,
      resolvedTracks: [{
        target: 'target:step',
        property: 'fit',
        interpolation: 'discrete' as const,
        keyframes: [
          { at: 0, value: 'cover' },
          { at: 500, value: 'contain' },
        ],
      }],
    }
    expect(collectTrackValues([stepAnimation], 'target:step', 1499)[0]?.value).toBe('cover')
    expect(collectTrackValues([stepAnimation], 'target:step', 1500)[0]?.value).toBe('contain')
  })

  it('updates running background animations through the native DOM animation clock', async () => {
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: { mode: 'image', assetName: 'bg.png' },
        animations: [{
          id: 'animation:running',
          state: 'running',
          startedAt: 1000,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [{
            target: 'background:main',
            property: 'x',
            keyframes: [
              { at: 0, value: 0 },
              { at: 1000, value: 100 },
            ],
          }],
        }],
      }),
    })

    await renderer.mount()
    expect(root.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 0')

    vi.mocked(Date.now).mockReturnValue(1500)
    frame?.(1500)
    expect(root.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 50')

    await renderer.unmount()
  })

  it('updates animated background mask URLs without churning unchanged asset URLs', async () => {
    const assets = await createImageAssets(['fog.png', 'mask-a.png', 'mask-b.png'])
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:background-mask:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        background: {
          mode: 'layered',
          layers: [{
            id: 'fog',
            assetName: 'fog.png',
            composition: {
              mask: { assetName: 'mask-a.png' },
            },
          }],
        },
        animations: [{
          id: 'animation:mask',
          state: 'running',
          startedAt: 1000,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [{
            target: 'backgroundLayer:fog',
            property: 'composition.mask.assetName',
            interpolation: 'discrete',
            keyframes: [
              { at: 0, value: 'mask-a.png' },
              { at: 500, value: 'mask-b.png' },
            ],
          }],
        }],
      }),
    })

    await renderer.mount()
    await flushDom()
    const item = root.querySelector<HTMLElement>('[data-background-layer-id="fog"]')
    const initialStyle = item?.getAttribute('style') || ''
    expect(initialStyle).toContain('mask-image: url("blob:background-mask:')
    expect(create).toHaveBeenCalledTimes(2)

    vi.mocked(Date.now).mockReturnValue(1200)
    frame?.(1200)
    await flushDom()
    expect(create).toHaveBeenCalledTimes(2)

    vi.mocked(Date.now).mockReturnValue(1500)
    frame?.(1500)
    await flushDom()
    expect(create).toHaveBeenCalledTimes(3)
    expect(item?.dataset.backgroundMaskKey).toBe('images:mask-b.png')
    expect(item?.getAttribute('style')).toContain('mask-image: url("blob:background-mask:3")')

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('renders sprite manifests and expressions through the Web sprite preset', async () => {
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:web-sprite:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-sprite-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: spriteAssetManifest(),
        }),
        getAsset: async (_id, record) => {
          if (record?.path === 'characters/alice/sprite.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'alice',
              base: { asset: 'base.png' },
              expressions: {
                happy: {
                  layers: [{ asset: 'happy.png' }],
                },
              },
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          sprite: 'alice/base.png',
          expression: 'happy',
        }],
        animations: [{
          id: 'sprite-layer:animation',
          state: 'paused',
          startedAt: Date.now() - 500,
          pausedAt: Date.now(),
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [{
            target: 'spriteLayer:Alice:expression',
            property: 'opacity',
            keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }],
          }],
        }],
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()

    const sprite = root.querySelector('.qua-sprite')
    expect(sprite).not.toBeNull()
    expect(sprite?.getAttribute('data-sprite-family')).toBe('alice')
    expect(sprite?.getAttribute('data-sprite-expression')).toBe('happy')
    expect(root.querySelectorAll('.qua-sprite-layer').length).toBe(2)
    expect(root.querySelectorAll('.qua-sprite-layer--expression').length).toBe(1)
    expect(root.querySelector('.qua-sprite-layer--expression')?.getAttribute('style')).toContain('opacity: 0.5')
    expect(create).toHaveBeenCalled()

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('resolves character sprite assets from the character runtime package', async () => {
    const requestedPackages: Array<string | undefined> = []
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:runtime-sprite:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-runtime-sprite-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            characterManifestRecord('other-manifest', 'alice/sprite.manifest.json', 'runtime.other-sprite', 100),
            characterManifestRecord('runtime-manifest', 'alice/sprite.manifest.json', 'runtime.sprite', 1),
            characterManifestRecord('other-base', 'alice/base.png', 'runtime.other-sprite', 100),
            characterManifestRecord('runtime-base', 'alice/base.png', 'runtime.sprite', 1),
            characterManifestRecord('other-happy', 'alice/happy.png', 'runtime.other-sprite', 100),
            characterManifestRecord('runtime-happy', 'alice/happy.png', 'runtime.sprite', 1),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedPackages.push(record?.runtimePackageId)
          if (record?.path === 'characters/alice/sprite.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'alice',
              base: { asset: 'base.png' },
              expressions: {
                happy: {
                  layers: [{ asset: 'happy.png' }],
                },
              },
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          sprite: 'alice/base.png',
          expression: 'happy',
          metadata: { contentPackageId: 'runtime.sprite' },
        }],
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()

    expect(requestedPackages.length).toBeGreaterThan(0)
    expect(requestedPackages.every(packageId => packageId === 'runtime.sprite')).toBe(true)
    expect(create).toHaveBeenCalled()

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('resolves sprite deltas through required runtime package candidates', async () => {
    const requestedAssets: Array<{ name: string, packageId?: string }> = []
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:runtime-sprite-delta:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-runtime-sprite-delta-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            characterManifestRecord('base-manifest', 'alice/sprite.manifest.json', 'runtime.base-sprite', 1),
            characterManifestRecord('delta-manifest', 'alice/sprite.manifest.json', 'runtime.delta-sprite', 100),
            characterManifestRecord('base-image', 'alice/base.png', 'runtime.base-sprite', 1),
            characterManifestRecord('delta-happy', 'alice/happy.png', 'runtime.delta-sprite', 100),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedAssets.push({ name: record?.name || '', packageId: record?.runtimePackageId })
          if (record?.path === 'characters/alice/sprite.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'alice',
              base: { asset: 'base.png' },
              expressions: {
                happy: {
                  layers: [{ asset: 'happy.png' }],
                },
              },
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          sprite: 'alice/base.png',
          expression: 'happy',
          metadata: {
            contentPackageId: 'runtime.base-sprite',
            requiredRuntimePackages: ['runtime.base-sprite', 'runtime.delta-sprite'],
          },
        }],
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()

    expect(requestedAssets).toContainEqual({ name: 'alice/sprite.manifest.json', packageId: 'runtime.delta-sprite' })
    expect(requestedAssets).toContainEqual({ name: 'alice/base.png', packageId: 'runtime.base-sprite' })
    expect(requestedAssets).toContainEqual({ name: 'alice/happy.png', packageId: 'runtime.delta-sprite' })
    expect(root.querySelectorAll('.qua-sprite-layer').length).toBe(2)
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(2)

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('applies unity-style ui skin borders and transient state changes', async () => {
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:web-ui-skin:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-ui-skin-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: uiSkinAssetManifest(),
        }),
        getAsset: async (_id, record) => {
          if (record?.path === 'ui/default/ui-skin.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'ui/default',
              skins: {
                panel: {
                  base: { asset: 'panel/default.png' },
                  slice: { top: 6, right: 6, bottom: 6, left: 6 },
                  contentInsets: { top: 8, right: 10, bottom: 8, left: 10 },
                },
                button: {
                  base: { asset: 'button/default.png' },
                  states: {
                    hover: { asset: 'button/hover.png' },
                    pressed: { asset: 'button/pressed.png' },
                    disabled: { asset: 'button/disabled.png' },
                  },
                  slice: { top: 4, right: 4, bottom: 4, left: 4 },
                  contentInsets: { top: 8, right: 12, bottom: 8, left: 12 },
                },
                toggle: {
                  base: { asset: 'toggle/default.png' },
                  states: {
                    selected: { asset: 'toggle/selected.png' },
                    hover: { asset: 'toggle/hover.png' },
                  },
                  slice: { top: 4, right: 4, bottom: 4, left: 4 },
                  contentInsets: { top: 6, right: 10, bottom: 6, left: 10 },
                },
              },
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        choices: [{
          id: 'yes',
          text: 'Yes',
          enabled: true,
          presentation: {
            skinId: 'button',
          },
        }, {
          id: 'locked',
          text: 'Locked',
          enabled: false,
          presentation: {
            skinId: 'button',
          },
        }],
        ui: {
          visible: true,
          overlays: {
            settings: {
              open: true,
            },
          },
        },
        plugins: {
          ui: {
            themeId: 'default',
            defaults: {
              button: 'button',
              panel: 'panel',
              toggle: 'toggle',
            },
          },
          [SETTINGS_PLUGIN_ID]: settingsProjection(),
        },
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()
    await flushDom()

    const button = await waitForStyle(() => root.querySelector<HTMLButtonElement>('.qua-choice-button[data-choice-id="yes"]'), style => style.includes('border-image-slice: 4 4 4 4'))
    expect(button?.dataset.skinReference).toBe('ui/default/button')
    const initialStyle = button?.getAttribute('style') || ''
    expect(initialStyle).toContain('border-image-slice: 4 4 4 4')
    expect(initialStyle).toContain('--qua-skin-source-current')
    expect(button?.dataset.skinState).toBe('default')

    button!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushDom()
    await flushDom()
    expect(button?.dataset.skinState).toBe('hover')
    const hoverStyle = button?.getAttribute('style') || ''
    expect(hoverStyle).not.toBe(initialStyle)

    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    await flushDom()
    await flushDom()
    expect(button?.dataset.skinState).toBe('pressed')
    const pressedStyle = button?.getAttribute('style') || ''
    expect(pressedStyle).not.toBe(hoverStyle)

    button!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    await flushDom()
    await flushDom()
    expect(button?.dataset.skinState).toBe('hover')

    button!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    await flushDom()
    await flushDom()
    expect(button?.dataset.skinState).toBe('default')

    const locked = root.querySelector<HTMLButtonElement>('.qua-choice-button[data-choice-id="locked"]')
    expect(locked?.dataset.skinState).toBe('disabled')
    locked!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushDom()
    await flushDom()
    expect(locked?.dataset.skinState).toBe('disabled')

    const toggle = root.querySelector<HTMLInputElement>('[data-settings-field="confirmBeforeQuit"] input[type="checkbox"]')
    expect(toggle?.dataset.skinState).toBe('selected')
    toggle!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushDom()
    await flushDom()
    expect(toggle?.dataset.skinState).toBe('selected')

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    expect(create).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('resolves ui skin image assets through manifest runtime package candidates', async () => {
    const requestedAssets: Array<{ name: string, packageId?: string }> = []
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:web-ui-skin-runtime')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-runtime-ui-skin-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            uiSkinDataManifestRecord('ui/default/ui-skin.manifest.json', undefined, 100),
            uiSkinDataManifestRecord('ui/default/ui-skin.manifest.json', 'runtime.ui-theme', 1),
            uiSkinImageManifestRecord('base-button', 'ui/default/button/default.png', 'runtime.ui-base', 1),
            uiSkinImageManifestRecord('delta-button', 'ui/default/button/default.png', 'runtime.ui-delta', 100),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedAssets.push({ name: record?.name || '', packageId: record?.runtimePackageId })
          if (record?.path === 'ui/default/ui-skin.manifest.json' && record.runtimePackageId === 'runtime.ui-theme') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'ui/default',
              metadata: {
                contentPackageId: 'runtime.ui-base',
                requiredRuntimePackages: ['runtime.ui-base', 'runtime.ui-delta'],
              },
              skins: {
                button: {
                  base: { asset: 'button/default.png' },
                  slice: { top: 4, right: 4, bottom: 4, left: 4 },
                },
              },
            }))
          }
          if (record?.path === 'ui/default/ui-skin.manifest.json') {
            return new TextEncoder().encode(JSON.stringify({
              version: 1,
              family: 'ui/default',
              skins: {},
            }))
          }
          return new Uint8Array([1, 2, 3])
        },
      },
    })
    await assets.initialize()

    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      assets,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
        plugins: {
          ui: {
            themeId: 'default',
            defaults: { button: 'button' },
            contentPackageId: 'runtime.ui-theme',
          },
        },
      }),
    })

    await renderer.mount()
    await flushDom()
    await flushDom()

    expect(requestedAssets).toContainEqual({
      name: 'ui/default/ui-skin.manifest.json',
      packageId: 'runtime.ui-theme',
    })
    expect(requestedAssets).toContainEqual({
      name: 'ui/default/button/default.png',
      packageId: 'runtime.ui-delta',
    })
    expect(create).toHaveBeenCalled()

    await renderer.unmount()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('caches resolved save slot preview sources and invalidates them explicitly', async () => {
    const createObjectURL = vi.fn(() => 'blob:preview-1')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })

    const source = {
      listSlots: async () => [],
      getSlotPreview: vi.fn(async (slotId: string) => ({
        kind: 'bytes' as const,
        bytes: new Uint8Array(slotId === 'slot-1' ? [1, 2, 3] : [4, 5, 6]),
        mimeType: 'image/webp',
      })),
      getSlotPreviews: vi.fn(async (slotIds: readonly string[]) => Object.fromEntries(slotIds.map(slotId => [slotId, {
        kind: 'bytes' as const,
        bytes: new Uint8Array(slotId === 'slot-1' ? [1, 2, 3] : [4, 5, 6]),
        mimeType: 'image/webp',
      }]))),
    }

    const cache = new WebSaveSlotPreviewCache(source, { ttlMs: 30_000 })
    const first = await cache.resolveMany(['slot-1'])
    const second = await cache.resolveMany(['slot-1'])

    expect(first['slot-1']).toBe('blob:preview-1')
    expect(second['slot-1']).toBe('blob:preview-1')
    expect(source.getSlotPreviews).toHaveBeenCalledTimes(1)
    expect(source.getSlotPreview).not.toHaveBeenCalled()

    cache.invalidate(['slot-1'])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')

    await cache.resolve('slot-1')
    expect(source.getSlotPreview).toHaveBeenCalledTimes(1)

    cache.dispose()
  })

  it('filters overlay and safe-ui capture roles from frozen save preview captures', async () => {
    const capture = installSavePreviewCaptureStubs()
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 900))

    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: { visible: true, text: 'Dialogue line' },
        ui: {
          visible: true,
          overlays: {
            menu: {
              open: true,
              title: 'Menu',
            },
          },
        },
      }),
    })

    const captureResults: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, payload => captureResults.push(payload))

    await renderer.mount()
    await flushDom()
    await flushDom()

    await emitLogicToRender(pipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-hide-overlays',
      saveOpId: 'save-hide-overlays',
      slotId: 'slot-1',
      reason: 'save',
      transaction: 'async-clone',
      policy: {
        uiMode: 'hide-overlays',
        format: 'image/webp',
      },
    })
    await capture.triggerNextImageLoad()
    await waitForMicrotasks(() => captureResults.length === 1)

    const hideOverlayMarkup = capture.svgMarkup.at(-1) || ''
    expect(hideOverlayMarkup).toContain('Dialogue line')
    expect(hideOverlayMarkup).toContain('data-qua-capture-role="safe-ui"')
    expect(hideOverlayMarkup).not.toContain('data-qua-capture-role="overlay"')

    await emitLogicToRender(pipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-scene-only',
      saveOpId: 'save-scene-only',
      slotId: 'slot-1',
      reason: 'autoSave',
      transaction: 'async-clone',
      policy: {
        uiMode: 'scene-only',
        format: 'image/webp',
      },
    })
    await capture.triggerNextImageLoad()
    await waitForMicrotasks(() => captureResults.length === 2)

    const sceneOnlyMarkup = capture.svgMarkup.at(-1) || ''
    expect(sceneOnlyMarkup).not.toContain('data-qua-capture-role="overlay"')
    expect(sceneOnlyMarkup).not.toContain('data-qua-capture-role="safe-ui"')
    expect(captureResults).toHaveLength(2)

    await renderer.unmount()
    capture.restore()
  })

  it('freezes async-clone save preview captures before the live DOM changes', async () => {
    const capture = installSavePreviewCaptureStubs()
    const pipeline = new Pipeline()
    const root = document.createElement('div')
    document.body.append(root)
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(1600, 900))

    const renderer = createQuaWebDomRenderer({
      container: root,
      pipeline,
      plugins: createVisualNovelWebRendererPlugins(),
      initialView: view({
        dialogue: { visible: true, text: 'Before Clone' },
      }),
    })

    const captureResults: unknown[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, payload => captureResults.push(payload))

    await renderer.mount()
    await flushDom()
    await flushDom()

    const asyncCloneRequest = emitLogicToRender(pipeline, LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'capture-async-clone',
      saveOpId: 'save-async-clone',
      slotId: 'slot-1',
      reason: 'autoSave',
      transaction: 'async-clone',
      policy: {
        uiMode: 'full',
        format: 'image/webp',
      },
    })
    await flushMicrotasks()
    await asyncCloneRequest

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({
        dialogue: { visible: true, text: 'After Clone' },
      }),
    })
    await flushDom()
    await flushMicrotasks()

    const frozenMarkup = capture.svgMarkup.at(-1) || ''
    expect(frozenMarkup).toContain('Before Clone')
    expect(frozenMarkup).not.toContain('After Clone')

    await capture.triggerNextImageLoad()
    await flushMicrotasks()
    expect(captureResults).toHaveLength(1)

    await renderer.unmount()
    capture.restore()
  })

  it('starts playing audio immediately when the Web Audio context is already running', async () => {
    installFakeAudioContext({ initialState: 'running' })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)

    await controller.destroy()
    await assets.cleanup()
  })

  it('resolves audio buffers through required runtime package candidates', async () => {
    installFakeAudioContext({ initialState: 'running' })
    const requestedPackages: Array<string | undefined> = []
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-web-runtime-audio-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            audioManifestRecord('base-bgm', 'bgm.ogg', 'runtime.audio-base', 1),
            audioManifestRecord('delta-bgm', 'bgm.ogg', 'runtime.audio-delta', 100),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedPackages.push(record?.runtimePackageId)
          return new Uint8Array([1, 2, 3, 4])
        },
      },
    })
    await assets.initialize()
    const pipeline = new Pipeline()
    const audio = createInitialAudioProjection()
    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => view({
        plugins: {
          [AUDIO_PLUGIN_ID]: {
            ...audio,
            bgm: {
              id: 'bgm:runtime',
              kind: 'bgm',
              assetKey: 'bgm.ogg',
              state: 'playing',
              contentPackageId: 'runtime.audio-base',
              metadata: {
                requiredRuntimePackages: ['runtime.audio-base', 'runtime.audio-delta'],
              },
            },
          },
        },
      }),
      document,
    })

    controller.start()
    await controller.sync()

    expect(requestedPackages).toEqual(['runtime.audio-delta'])
    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)

    await controller.destroy()
    await assets.cleanup()
  })

  it('starts pending audio when automatic Web Audio resume is allowed', async () => {
    installFakeAudioContext({
      initialState: 'suspended',
      resume: (context) => {
        context.state = 'running'
      },
    })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)

    await controller.destroy()
    await assets.cleanup()
  })

  it('queues autoplay-blocked audio and unlocks it on the next user gesture', async () => {
    let allowResume = false
    installFakeAudioContext({
      initialState: 'suspended',
      resume: async (context) => {
        if (!allowResume) {
          throw new Error('autoplay blocked')
        }
        context.state = 'running'
      },
    })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const unlocked: unknown[] = []
    const errors: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.UNLOCKED, payload => unlocked.push(payload))
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.ERROR, payload => errors.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioView(),
      document,
    })

    controller.start()
    await controller.sync()
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).not.toHaveBeenCalled()
    expect(unlocked).toHaveLength(0)
    expect(errors).toHaveLength(0)

    allowResume = true
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(unlocked).toHaveLength(1)
    expect(errors).toHaveLength(0)

    await controller.destroy()
    await assets.cleanup()
  })

  it('plays concurrent SFX and ambient projection tracks through WebAudio', async () => {
    installFakeAudioContext({ initialState: 'running' })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const ended: Array<{ channel: string, id: string }> = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.ENDED, payload => ended.push({
      channel: payload.channel,
      id: payload.id,
    }))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioEffectsView(),
      document,
    })

    controller.start()
    await controller.sync()

    expect(FakeAudioContext.sources).toHaveLength(3)
    expect(FakeAudioContext.sources[0]?.loop).toBe(false)
    expect(FakeAudioContext.sources[1]?.loop).toBe(false)
    expect(FakeAudioContext.sources[2]?.loop).toBe(true)
    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(FakeAudioContext.sources[1]?.start).toHaveBeenCalledWith(0, 0)
    expect(FakeAudioContext.sources[2]?.start).toHaveBeenCalledWith(0, 0)

    FakeAudioContext.sources[0]?.onended?.call(FakeAudioContext.sources[0] as any, new Event('ended'))
    FakeAudioContext.sources[2]?.onended?.call(FakeAudioContext.sources[2] as any, new Event('ended'))
    await flushDom()

    expect(ended).toEqual([
      { channel: 'sfx', id: 'click' },
      { channel: 'ambient', id: 'rain' },
    ])

    await controller.destroy()
    await assets.cleanup()
  })

  it('keeps SFX and ambient pending until autoplay unlock succeeds', async () => {
    let allowResume = false
    installFakeAudioContext({
      initialState: 'suspended',
      resume: async (context) => {
        if (!allowResume) {
          throw new Error('autoplay blocked')
        }
        context.state = 'running'
      },
    })
    const assets = await createAudioAssets()
    const pipeline = new Pipeline()
    const errors: unknown[] = []
    onAudioRenderToLogic(pipeline, AudioRenderToLogicEvents.ERROR, payload => errors.push(payload))

    const controller = new WebAudioRendererController({
      getPipeline: () => pipeline,
      getAssets: () => assets,
      getViewState: () => audioEffectsView(),
      document,
    })

    controller.start()
    await controller.sync()
    await flushDom()

    expect(FakeAudioContext.sources).toHaveLength(3)
    expect(FakeAudioContext.sources[0]?.start).not.toHaveBeenCalled()
    expect(FakeAudioContext.sources[1]?.start).not.toHaveBeenCalled()
    expect(FakeAudioContext.sources[2]?.start).not.toHaveBeenCalled()
    expect(errors).toHaveLength(0)

    allowResume = true
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushDom()

    expect(FakeAudioContext.sources[0]?.start).toHaveBeenCalledWith(0, 0)
    expect(FakeAudioContext.sources[1]?.start).toHaveBeenCalledWith(0, 0)
    expect(FakeAudioContext.sources[2]?.start).toHaveBeenCalledWith(0, 0)
    expect(errors).toHaveLength(0)

    await controller.destroy()
    await assets.cleanup()
  })
})

function view(overrides: Partial<QuaViewProjection> = {}): QuaViewProjection {
  return {
    layout: createViewLayoutProjection(),
    characters: [],
    dialogue: { visible: false, text: '' },
    choices: [],
    ui: { visible: true },
    flowControl: createFlowControlProjection(),
    effects: [],
    animations: [],
    plugins: {},
    ...overrides,
  }
}

function galleryProjection(): GalleryProjection {
  return {
    revision: 1,
    sceneActive: true,
    profileId: 'default',
    catalogs: [{
      id: 'cg',
      title: 'CG',
      entryIds: ['cg.sunset', 'cg.night'],
      totalEntries: 2,
      unlockedEntries: 1,
      lockedEntries: 1,
    }],
    entries: [
      {
        id: 'cg.sunset',
        catalogId: 'cg',
        title: 'Sunset',
        summary: 'Beach',
        contents: [{
          id: 'cg.sunset.text',
          kind: 'text',
          text: 'Sunset CG',
        }],
        unlocked: true,
      },
      {
        id: 'cg.night',
        catalogId: 'cg',
        title: 'Night',
        contents: [{
          id: 'cg.night.text',
          kind: 'text',
          text: 'Night CG',
        }],
        unlocked: false,
      },
    ],
    filteredEntryIds: ['cg.sunset', 'cg.night'],
    selectedCatalogId: 'cg',
    selectedEntryId: 'cg.sunset',
    selectedContentId: 'cg.sunset.text',
    requiredRuntimePackages: [],
    filter: {},
  }
}

function achievementProjection(): AchievementProjection {
  return {
    revision: 1,
    sceneActive: true,
    profileId: 'default',
    notificationMode: 'toast',
    groups: [
      {
        id: 'main',
        title: 'Main',
        totalAchievements: 1,
        unlockedAchievements: 1,
        lockedAchievements: 0,
      },
      {
        id: 'side',
        title: 'Side',
        totalAchievements: 1,
        unlockedAchievements: 0,
        lockedAchievements: 1,
      },
    ],
    achievements: [
      {
        id: 'story.first-step',
        groupId: 'main',
        title: 'First Step',
        summary: 'Reach the first milestone',
        unlocked: true,
        unlockRecord: {
          achievementId: 'story.first-step',
          unlockedAt: Date.now(),
          notificationMode: 'toast',
        },
      },
      {
        id: 'cg.master',
        groupId: 'side',
        title: 'CG Master',
        hidden: true,
        summary: 'Unlock the hidden gallery reward',
        unlocked: false,
      },
    ],
    filteredAchievementIds: ['story.first-step', 'cg.master'],
    selectedGroupId: 'main',
    selectedAchievementId: 'story.first-step',
    notifications: [{
      id: 'toast-1',
      achievementId: 'story.first-step',
      title: 'Achievement Unlocked',
      summary: 'First Step',
      mode: 'toast',
      durationMs: 1500,
      createdAt: Date.now(),
    }],
    requiredRuntimePackages: [],
    filter: {
      includeHidden: true,
    },
  }
}

function settingsProjection() {
  return {
    revision: 1,
    profileId: 'default',
    updatedAt: 1,
    scopes: {
      system: {
        title: 'System',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            textSpeedCps: {
              type: 'number',
              title: 'Text Speed',
              minimum: 5,
              maximum: 120,
              multipleOf: 1,
            },
            skipMode: {
              type: 'string',
              title: 'Skip Mode',
              enum: ['read', 'all'],
            },
            confirmBeforeQuit: {
              type: 'boolean',
              title: 'Confirm Before Quit',
            },
            layout: {
              type: 'object',
              title: 'Layout',
              properties: {
                gap: {
                  type: 'number',
                },
              },
            },
            shader: {
              type: 'string',
              title: 'Shader',
            },
          },
        },
        ui: {
          label: 'System',
          order: 0,
          controls: {
            textSpeedCps: {
              control: 'slider',
              order: 0,
              min: 5,
              max: 120,
              step: 1,
            },
            skipMode: {
              control: 'select',
              order: 1,
              options: [
                { label: 'Read Text', value: 'read' },
                { label: 'All Text', value: 'all' },
              ],
            },
            confirmBeforeQuit: {
              control: 'switch',
              order: 2,
            },
            layout: {
              control: 'text',
              order: 3,
            },
            shader: {
              control: 'custom',
              component: 'ShaderPicker',
              props: {
                mode: 'compact',
              },
              order: 4,
            },
          },
        },
        defaults: {
          textSpeedCps: 45,
          skipMode: 'read',
          confirmBeforeQuit: true,
          layout: {
            gap: 8,
          },
          shader: 'soft',
        },
        values: {
          textSpeedCps: 45,
          skipMode: 'read',
          confirmBeforeQuit: true,
          layout: {
            gap: 8,
          },
          shader: 'soft',
        },
      },
    },
  }
}

async function flushDom(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function installSavePreviewCaptureStubs() {
  const svgMarkup: string[] = []
  const blobUrls = new Map<string, Blob>()
  const pendingImageLoads: Array<() => void> = []
  const urlApi = {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      const url = `blob:preview-${blobUrls.size + 1}`
      blobUrls.set(url, blob)
      void blob.text().then(text => svgMarkup.push(text))
      return url
    }),
    revokeObjectURL: vi.fn((url: string) => {
      blobUrls.delete(url)
    }),
  }
  vi.stubGlobal('URL', urlApi)

  const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() {
      return this.getAttribute('src') || ''
    },
    set(value: string) {
      this.setAttribute('src', value)
      pendingImageLoads.push(() => {
        this.onload?.(new Event('load'))
      })
    },
  })

  const context2d = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context2d as unknown as CanvasRenderingContext2D)
  const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    callback?.(new Blob([new Uint8Array([4, 5, 6]).buffer], { type: type || 'image/webp' }))
  })

  return {
    svgMarkup,
    async triggerNextImageLoad() {
      const load = pendingImageLoads.shift()
      load?.()
      await flushMicrotasks()
    },
    restore() {
      getContextSpy.mockRestore()
      toBlobSpy.mockRestore()
      if (originalSrcDescriptor) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', originalSrcDescriptor)
      }
      else {
        delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).src
      }
    },
  }
}

async function waitForMicrotasks(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    if (predicate()) {
      return
    }
    await Promise.resolve()
  }
}

async function waitForStyle(
  getElement: () => HTMLElement | null | undefined,
  predicate: (style: string) => boolean,
): Promise<HTMLElement | null> {
  for (let index = 0; index < 20; index += 1) {
    const element = getElement()
    if (element && predicate(element.getAttribute('style') || '')) {
      return element
    }
    await flushDom()
    await flushMicrotasks()
  }
  return getElement() || null
}

function rect(width: number, height: number): DOMRect {
  return rectAt(0, 0, width, height)
}

function rectAt(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    right: left + width,
    bottom: top + height,
    left,
    toJSON: () => ({}),
  } as DOMRect
}

function spriteAssetManifest() {
  return [
    {
      id: 'memory:default:characters:alice/sprite.manifest.json',
      bundleName: 'memory',
      name: 'alice/sprite.manifest.json',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/sprite.manifest.json',
      mimeType: 'application/json',
    },
    {
      id: 'memory:default:characters:alice/base.png',
      bundleName: 'memory',
      name: 'alice/base.png',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/base.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:characters:alice/happy.png',
      bundleName: 'memory',
      name: 'alice/happy.png',
      type: 'characters' as const,
      locale: 'default',
      path: 'characters/alice/happy.png',
      mimeType: 'image/png',
    },
  ]
}

function uiSkinAssetManifest() {
  return [
    {
      id: 'memory:default:data:ui/default/ui-skin.manifest.json',
      bundleName: 'memory',
      name: 'ui/default/ui-skin.manifest.json',
      type: 'data' as const,
      locale: 'default',
      path: 'ui/default/ui-skin.manifest.json',
      mimeType: 'application/json',
    },
    {
      id: 'memory:default:images:ui/default/button/default.png',
      bundleName: 'memory',
      name: 'ui/default/button/default.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/button/default.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/button/hover.png',
      bundleName: 'memory',
      name: 'ui/default/button/hover.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/button/hover.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/button/pressed.png',
      bundleName: 'memory',
      name: 'ui/default/button/pressed.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/button/pressed.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/button/disabled.png',
      bundleName: 'memory',
      name: 'ui/default/button/disabled.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/button/disabled.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/toggle/default.png',
      bundleName: 'memory',
      name: 'ui/default/toggle/default.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/toggle/default.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/toggle/hover.png',
      bundleName: 'memory',
      name: 'ui/default/toggle/hover.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/toggle/hover.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/toggle/selected.png',
      bundleName: 'memory',
      name: 'ui/default/toggle/selected.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/toggle/selected.png',
      mimeType: 'image/png',
    },
    {
      id: 'memory:default:images:ui/default/panel/default.png',
      bundleName: 'memory',
      name: 'ui/default/panel/default.png',
      type: 'images' as const,
      locale: 'default',
      path: 'ui/default/panel/default.png',
      mimeType: 'image/png',
    },
  ]
}

function audioView(): QuaViewProjection {
  const audio = createInitialAudioProjection()
  return view({
    plugins: {
      [AUDIO_PLUGIN_ID]: {
        ...audio,
        bgm: {
          id: 'bgm:1',
          kind: 'bgm',
          assetKey: 'bgm.ogg',
          state: 'playing',
          loop: true,
        },
      },
    },
  })
}

function audioEffectsView(): QuaViewProjection {
  const audio = createInitialAudioProjection()
  return view({
    plugins: {
      [AUDIO_PLUGIN_ID]: {
        ...audio,
        sfx: [
          {
            id: 'click',
            kind: 'sfx',
            assetKey: 'sfx/click.ogg',
            state: 'playing',
          },
          {
            id: 'door',
            kind: 'sfx',
            assetKey: 'sfx/door.ogg',
            state: 'playing',
          },
        ],
        ambients: [
          {
            id: 'rain',
            kind: 'ambient',
            assetKey: 'ambient/rain.ogg',
            state: 'playing',
            loop: true,
          },
        ],
      },
    },
  })
}

async function createAudioAssets(): Promise<QuaAssets> {
  const assets = new QuaAssets({
    adapter: {
      name: 'renderer-web-audio-test',
      storage: new MemoryAssetStorage(),
      crypto: { sha256: async () => '' },
    },
    provider: {
      mode: 'memory',
      getManifest: async () => ({
        version: '1',
        assets: [
          audioAssetRecord('bgm.ogg'),
          audioAssetRecord('sfx/click.ogg'),
          audioAssetRecord('sfx/door.ogg'),
          audioAssetRecord('ambient/rain.ogg'),
        ],
      }),
      getAsset: async () => new Uint8Array([1, 2, 3, 4]),
    },
  })
  await assets.initialize()
  return assets
}

async function createFontAssets(): Promise<QuaAssets> {
  const assets = new QuaAssets({
    adapter: {
      name: 'renderer-web-font-test',
      storage: new MemoryAssetStorage(),
      crypto: { sha256: async () => '' },
    },
    provider: {
      mode: 'memory',
      getManifest: async () => ({
        version: '1',
        assets: [
          fontAssetRecord('display.woff2'),
        ],
      }),
      getAsset: async () => new Uint8Array([1, 2, 3, 4]),
    },
  })
  await assets.initialize()
  return assets
}

async function createImageAssets(names: string[]): Promise<QuaAssets> {
  const assets = new QuaAssets({
    adapter: {
      name: 'renderer-web-image-test',
      storage: new MemoryAssetStorage(),
      crypto: { sha256: async () => '' },
    },
    provider: {
      mode: 'memory',
      getManifest: async () => ({
        version: '1',
        assets: names.map(imageAssetRecord),
      }),
      getAsset: async () => new Uint8Array([1, 2, 3, 4]),
    },
  })
  await assets.initialize()
  return assets
}

function uiSkinDataManifestRecord(name: string, runtimePackageId?: string, bundlePriority?: number) {
  return {
    id: runtimePackageId ? `${runtimePackageId}:data:${name}` : `memory:default:data:${name}`,
    bundleName: runtimePackageId || 'memory',
    bundlePriority,
    runtimePackageId,
    name,
    type: 'data' as const,
    locale: 'default',
    path: name,
    mimeType: 'application/json',
  }
}

function uiSkinImageManifestRecord(id: string, name: string, runtimePackageId: string, bundlePriority: number) {
  return {
    id,
    bundleName: runtimePackageId,
    bundlePriority,
    runtimePackageId,
    name,
    type: 'images' as const,
    locale: 'default',
    path: name,
    mimeType: 'image/png',
  }
}

function audioAssetRecord(name: string) {
  return {
    id: `memory:default:audio:${name}`,
    bundleName: 'memory',
    name,
    type: 'audio' as const,
    locale: 'default',
    path: `audio/${name}`,
    mimeType: 'audio/ogg',
  }
}

function imageAssetRecord(name: string) {
  return {
    id: `memory:default:images:${name}`,
    bundleName: 'memory',
    name,
    type: 'images' as const,
    locale: 'default',
    path: `images/${name}`,
    mimeType: 'image/png',
  }
}

function characterManifestRecord(id: string, name: string, runtimePackageId: string, bundlePriority: number) {
  return {
    id,
    bundleName: runtimePackageId,
    bundlePriority,
    runtimePackageId,
    name,
    type: 'characters' as const,
    locale: 'default',
    path: `characters/${name}`,
    mimeType: name.endsWith('.json') ? 'application/json' : 'image/png',
  }
}

function fontAssetRecord(name: string) {
  return {
    id: `memory:default:fonts:${name}`,
    bundleName: 'memory',
    name,
    type: 'fonts' as const,
    locale: 'default',
    path: `fonts/${name}`,
    mimeType: 'font/woff2',
  }
}

function fontManifestRecord(id: string, name: string, runtimePackageId: string, bundlePriority: number) {
  return {
    id,
    bundleName: runtimePackageId,
    bundlePriority,
    runtimePackageId,
    name,
    type: 'fonts' as const,
    locale: 'default',
    path: `fonts/${name}`,
    mimeType: 'font/woff2',
  }
}

function audioManifestRecord(id: string, name: string, runtimePackageId: string, bundlePriority: number) {
  return {
    id,
    bundleName: runtimePackageId,
    bundlePriority,
    runtimePackageId,
    name,
    type: 'audio' as const,
    locale: 'default',
    path: `audio/${name}`,
    mimeType: 'audio/ogg',
  }
}

function installFakeFontFace() {
  const originalFontFace = Object.getOwnPropertyDescriptor(window, 'FontFace')
  const originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  const created: Array<{
    family: string
    source: string | BufferSource
    descriptors?: FontFaceDescriptors
    load: () => Promise<FontFace>
  }> = []
  const add = vi.fn()
  const deleteFace = vi.fn()

  class FakeFontFace {
    family: string
    source: string | BufferSource
    descriptors?: FontFaceDescriptors

    constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
      this.family = family
      this.source = source
      this.descriptors = descriptors
      created.push(this as unknown as typeof created[number])
    }

    async load(): Promise<FontFace> {
      return this as unknown as FontFace
    }
  }

  Object.defineProperty(window, 'FontFace', {
    configurable: true,
    value: FakeFontFace,
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add,
      delete: deleteFace,
    },
  })

  return {
    created,
    add,
    delete: deleteFace,
    restore() {
      if (originalFontFace) {
        Object.defineProperty(window, 'FontFace', originalFontFace)
      }
      else {
        delete (window as Partial<Window>).FontFace
      }
      if (originalDocumentFonts) {
        Object.defineProperty(document, 'fonts', originalDocumentFonts)
      }
      else {
        delete (document as Partial<Document>).fonts
      }
    },
  }
}

interface FakeAudioContextOptions {
  initialState: AudioContextState
  resume?: (context: FakeAudioContext) => Promise<void> | void
}

function installFakeAudioContext(options: FakeAudioContextOptions): void {
  FakeAudioContext.initialState = options.initialState
  FakeAudioContext.resumeHandler = options.resume || ((context) => {
    context.state = 'running'
  })
  FakeAudioContext.sources = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('webkitAudioContext', undefined)
}

class FakeAudioContext {
  static initialState: AudioContextState = 'suspended'
  static resumeHandler: (context: FakeAudioContext) => Promise<void> | void = (context) => {
    context.state = 'running'
  }

  static sources: FakeAudioBufferSourceNode[] = []

  state: AudioContextState
  currentTime = 0
  destination = new FakeAudioNode()

  constructor() {
    this.state = FakeAudioContext.initialState
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilterNode() as unknown as BiquadFilterNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeAudioBufferSourceNode()
    FakeAudioContext.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  async decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return {} as AudioBuffer
  }

  async resume(): Promise<void> {
    await FakeAudioContext.resumeHandler(this)
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

class FakeAudioParam {
  value = 1

  cancelScheduledValues(_startTime: number): this {
    return this
  }

  setValueAtTime(value: number, _startTime: number): this {
    this.value = value
    return this
  }

  linearRampToValueAtTime(value: number, _endTime: number): this {
    this.value = value
    return this
  }
}

class FakeAudioNode {
  connect(_destinationNode: AudioNode): AudioNode {
    return _destinationNode
  }

  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam()
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'peaking'
  frequency = new FakeAudioParam()
  gain = new FakeAudioParam()
  Q = new FakeAudioParam()
  detune = new FakeAudioParam()
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  loop = false
  onended: ((this: AudioScheduledSourceNode, ev: Event) => unknown) | null = null
  start = vi.fn()
  stop = vi.fn()
}
