import type { QuaViewProjection } from '@quajs/render-core'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { Pipeline } from '@quajs/pipeline'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents,
  createInitialAudioProjection,
  onAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { FONTS_PLUGIN_ID } from '@quajs/plugin-fonts/contracts'
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
  clientPointToStageLogical,
  characterProjectionVars,
  collectTrackValues,
  createQuaWebDomRenderer,
  createQuaWebRendererController,
  createReactRendererStoreAdapter,
  projectAudioProjection,
  readCssSafeAreaInsets,
  resolveStageLayout,
  stageContentStyle,
  stageLogicalToClientPoint,
} from '../src'
import { WebAudioRendererController } from '../src/audio'
import { createVisualNovelWebRendererPlugins } from '../src/plugins/preset'

describe('@quajs/renderer-web', () => {
  afterEach(() => {
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
    root.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    root.querySelector('.qua-stage')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushDom()

    expect(choices).toEqual(['yes'])
    expect(advances).toEqual([{ source: 'dialogue' }, { source: 'stage-click' }])

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

async function flushDom(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
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
