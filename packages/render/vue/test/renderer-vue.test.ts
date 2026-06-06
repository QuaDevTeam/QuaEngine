import type { AssetData } from '@quajs/assets'
import type { AchievementProjection } from '@quajs/plugin-achievement/contracts'
import type { GalleryProjection } from '@quajs/plugin-gallery/contracts'
import type { QuaViewProjection, RendererPlugin } from '@quajs/render-core'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'
import { createViteDevAssetRuntime } from '@quajs/assets-web'
import { Pipeline } from '@quajs/pipeline'
import { ACHIEVEMENT_PLUGIN_ID, AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { FONTS_PLUGIN_ID } from '@quajs/plugin-fonts/contracts'
import { GALLERY_PLUGIN_ID, GalleryRenderToLogicEvents } from '@quajs/plugin-gallery/contracts'
import { SETTINGS_PLUGIN_ID, SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  emitLogicToRender,
  LogicToRenderEvents,
  onRenderToLogic,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { DEFAULT_DIALOGUE_PRESENCE_EXIT_MS } from '@quajs/renderer-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, isReadonly, nextTick } from 'vue'
import {
  QuaRenderer,
  useAssetUrl,
  useChoices,
  useQuaRenderer,
  useRendererActions,
} from '../src'
import { createInputRendererPlugin } from '../src/plugins/input'
import { createVisualNovelRendererPlugins } from '../src/plugins/preset'
import { createSettingsRendererPlugin, QuaSettingsLayer } from '../src/plugins/settings'
import { QuaSpriteSkinBox } from '../src/plugins/sprite'
import { QuaConfirmOverlay, QuaMenuOverlay, QuaSaveLoadPanel, QuaSettingsPanel, QuaStoryTree, QuaUiOverlay, UI_TITLE_REQUEST_EVENT } from '../src/plugins/ui'

describe('@quajs/renderer-vue', () => {
  afterEach(() => {
    vi.useRealTimers()
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

  it('renders rich speaker content and speaker style', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          characterName: 'Alice',
          speaker: {
            kind: 'rich-text',
            backgroundColor: '#001122',
            blocks: [{
              spans: [{ id: 'name', text: 'Alice', color: '#ff6699' }],
            }],
          },
          speakerStyle: { color: '#7cc7ff', fontSize: 28, fontFamily: 'Qua Serif', opacity: 0.75 },
          text: 'Line',
        },
      }),
    })

    await flushVue()

    const speaker = host.el.querySelector<HTMLElement>('.qua-dialogue-speaker')
    const span = host.el.querySelector<HTMLElement>('.qua-dialogue-speaker .qua-rich-text-span')
    expect(speaker?.textContent).toBe('Alice')
    expect(speaker?.getAttribute('style')).toContain('--qua-dialogue-speaker-color: #7cc7ff')
    expect(speaker?.getAttribute('style')).toContain('--qua-dialogue-speaker-font-size: 28px')
    expect(speaker?.getAttribute('style')).toContain('--qua-dialogue-speaker-font-family: Qua Serif')
    expect(speaker?.getAttribute('style')).toContain('opacity: var(--qua-dialogue-speaker-opacity, 1)')
    expect(speaker?.getAttribute('style')).toContain('--qua-rich-text-background-color: #001122')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-color: #ff6699')

    host.app.unmount()
  })

  it('wires scene transitions through the default Vue preset', async () => {
    const pipeline = new Pipeline()
    const readyScenes: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.SCENE_READY, payload => readyScenes.push(payload.sceneId || ''))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view(),
    })

    await flushVue()
    await emitLogicToRender(pipeline, LogicToRenderEvents.SCENE_CHANGE, {
      toScene: 'intro',
      transition: { type: 'instant' },
    })
    await flushVue()

    expect(readyScenes).toEqual(['intro'])
    expect(host.el.querySelector('.qua-scene-transition')).toBeNull()

    host.app.unmount()
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

  it('projects backlog UI and emits backlog plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(BacklogRenderToLogicEvents.JUMP_REQUEST, context => received.push({ type: 'jump', payload: context.event.payload }))
    pipeline.on(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, context => received.push({ type: 'voice', payload: context.event.payload }))
    pipeline.on(BacklogRenderToLogicEvents.CLOSE_REQUEST, context => received.push({ type: 'close', payload: context.event.payload }))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [BACKLOG_PLUGIN_ID]: {
            revision: 1,
            visible: true,
            ui: {
              scene: {
                id: 'game:backlog',
                presentation: 'overlay',
                overlay: {
                  variant: 'game-modal',
                  hideHud: true,
                  hideDialogue: true,
                },
              },
            },
            retention: { scope: 'chapter', maxEntries: 200 },
            defaultPolicy: { include: true, rewindable: true, voiceReplay: true },
            entries: [{
              id: 'entry-1',
              kind: 'dialogue',
              speaker: 'Alice',
              text: 'Backlog line',
              checkpointId: 'checkpoint-1',
              voice: { assetKey: 'voice.ogg' },
              rewindable: true,
              voiceReplay: true,
              gameTimeMs: 123000,
              recordedAt: Date.now(),
            }, {
              id: 'entry-2',
              kind: 'dialogue',
              speaker: 'Bob',
              text: 'Read only line',
              rewindable: false,
              voiceReplay: false,
              gameTimeMs: 124000,
              recordedAt: Date.now(),
            }],
          },
        },
      }),
    })

    await flushVue()
    expect(host.el.querySelector('.qua-screen-plane .qua-backlog-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-overlay .qua-backlog-layer')).toBeNull()
    expect(host.el.querySelector('.qua-stage-safe .qua-backlog-layer')).toBeNull()
    const backlogLayer = host.el.querySelector<HTMLElement>('.qua-backlog-layer')!
    expect(backlogLayer.getAttribute('data-ui-scene-id')).toBe('game:backlog')
    expect(backlogLayer.dataset.overlayStack).toBe('overlay')
    expect(backlogLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.backlog))
    expect(host.el.querySelector('.qua-backlog-title')?.textContent).toBe('Backlog')
    expect(host.el.querySelector('.qua-backlog-kicker')).toBeNull()
    expect(host.el.querySelector('.qua-backlog-subtitle')).toBeNull()
    expect(host.el.querySelector('.qua-backlog-entry-kind')).toBeNull()
    expect(host.el.querySelector('.qua-backlog-entry-time')?.textContent).toBe('00:02:03')
    expect(host.el.querySelector('.qua-backlog-entry-speaker')?.textContent).toBe('Alice')
    expect(host.el.textContent).toContain('Backlog line')
    const readOnlyEntry = host.el.querySelector<HTMLElement>('[data-backlog-entry="entry-2"] .qua-backlog-entry-main')!
    expect(readOnlyEntry.tagName).toBe('ARTICLE')
    readOnlyEntry.click()
    host.el.querySelector<HTMLButtonElement>('.qua-backlog-entry-main')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-backlog-entry-voice')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-backlog-close')!.click()
    await flushVue()

    expect(received).toEqual([
      { type: 'jump', payload: { entryId: 'entry-1' } },
      { type: 'voice', payload: { entryId: 'entry-1' } },
      { type: 'close', payload: {} },
    ])
  })

  it('projects gallery scene UI and emits gallery plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, context => received.push(context.event.payload))
    pipeline.on(GalleryRenderToLogicEvents.SELECT_CONTENT_REQUEST, context => received.push(context.event.payload))
    pipeline.on(GalleryRenderToLogicEvents.CLOSE_REQUEST, context => received.push(context.event.payload))

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [GALLERY_PLUGIN_ID]: galleryProjection(),
        },
      }),
    })

    await flushVue()
    const galleryLayer = host.el.querySelector<HTMLElement>('.qua-gallery-layer')!
    expect(host.el.querySelector('.qua-stage-overlay .qua-gallery-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-screen-plane .qua-gallery-layer')).toBeNull()
    expect(galleryLayer).not.toBeNull()
    expect(galleryLayer.dataset.overlayStack).toBe('overlay')
    expect(galleryLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.gallery))
    expect(host.el.querySelector('.qua-gallery-panel')).not.toBeNull()
    expect(host.el.textContent).toContain('CG')
    expect(host.el.textContent).toContain('Sunset')
    expect(host.el.querySelector('.qua-gallery-header-actions .qua-gallery-meta')?.textContent).toBe('1/2')
    expect(host.el.querySelector('.qua-gallery-close')?.textContent).toBe('×')
    expect(host.el.querySelector('.qua-gallery-close')?.getAttribute('aria-label')).toBe('Close gallery')
    expect(host.el.querySelector('.qua-gallery-toolbar')).toBeNull()
    expect(host.el.querySelector('.qua-gallery-search-input')).toBeNull()
    expect(host.el.querySelector('[data-gallery-entry-id="cg.sunset"] .qua-gallery-entry-state')).toBeNull()
    expect(host.el.querySelector('[data-gallery-entry-id="cg.night"] .qua-gallery-entry-placeholder')?.textContent).toBe('')

    host.el.querySelector<HTMLButtonElement>('[data-gallery-entry-id="cg.night"]')!.click()
    host.el.querySelector<HTMLButtonElement>('[data-gallery-content-id="cg.sunset.text"]')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-gallery-close')!.click()
    await flushVue()

    expect(received).toEqual([
      { entryId: 'cg.night' },
      { contentId: 'cg.sunset.text' },
      {},
    ])
  })

  it('renders text gallery content in the lightbox', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [GALLERY_PLUGIN_ID]: galleryProjection(),
        },
      }),
    })

    await flushVue()
    host.el.querySelector<HTMLButtonElement>('[data-gallery-entry-id="cg.sunset"]')!.click()
    await flushVue()

    const lightbox = host.el.querySelector('.qua-gallery-lightbox')
    expect(lightbox).not.toBeNull()
    expect(lightbox?.parentElement).toBe(host.el.querySelector('.qua-gallery-layer'))
    expect(host.el.querySelector('.qua-gallery-panel .qua-gallery-lightbox')).toBeNull()
    expect(lightbox?.classList.contains('qua-gallery-lightbox--overlay-scene')).toBe(true)
    expect(lightbox?.getAttribute('data-gallery-lightbox-mode')).toBe('overlay-scene')
    expect(host.el.querySelector('.qua-gallery-lightbox-close')?.parentElement).toBe(host.el.querySelector('.qua-gallery-lightbox-media'))
    expect(host.el.querySelector('.qua-gallery-lightbox-close')?.textContent).toBe('×')
    expect(host.el.querySelector('.qua-gallery-lightbox-close')?.getAttribute('aria-label')).toBe('Close lightbox')
    expect(host.el.querySelector('.qua-gallery-lightbox-caption')?.parentElement).toBe(host.el.querySelector('.qua-gallery-lightbox-media'))
    expect(host.el.querySelector('.qua-gallery-lightbox-media')?.textContent).toContain('Sunset CG')
    expect(host.el.querySelector('.qua-gallery-lightbox-caption')?.textContent).toBe('Sunset Note')
  })

  it('toggles image gallery lightbox chrome from image clicks and hides it from blank media clicks', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [GALLERY_PLUGIN_ID]: galleryProjectionWithImage(),
        },
      }),
    })

    await flushVue()
    host.el.querySelector<HTMLButtonElement>('[data-gallery-entry-id="cg.sunset"]')!.click()
    await flushVue()

    expect(host.el.querySelector('.qua-gallery-lightbox')?.classList.contains('is-chrome-hidden')).toBe(false)
    host.el.querySelector<HTMLElement>('.qua-gallery-lightbox .qua-gallery-asset-preview--image')!.click()
    await flushVue()

    expect(host.el.querySelector('.qua-gallery-lightbox')?.classList.contains('is-chrome-hidden')).toBe(true)
    host.el.querySelector<HTMLElement>('.qua-gallery-lightbox .qua-gallery-asset-preview--image')!.click()
    await flushVue()

    expect(host.el.querySelector('.qua-gallery-lightbox')?.classList.contains('is-chrome-hidden')).toBe(false)
    host.el.querySelector<HTMLElement>('.qua-gallery-lightbox-media')!.click()
    await flushVue()

    expect(host.el.querySelector('.qua-gallery-lightbox')?.classList.contains('is-chrome-hidden')).toBe(true)
  })

  it('renders projected locked gallery content in the lightbox', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [GALLERY_PLUGIN_ID]: galleryProjection(),
        },
      }),
    })

    await flushVue()
    host.el.querySelector<HTMLButtonElement>('[data-gallery-entry-id="cg.night"]')!.click()
    await flushVue()

    expect(host.el.querySelector('.qua-gallery-lightbox')).not.toBeNull()
    expect(host.el.querySelector('.qua-gallery-lightbox-media')?.textContent).toContain('Night CG')
    expect(host.el.querySelector('.qua-gallery-lightbox-caption')?.textContent).toBe('Night')
  })

  it('projects achievement board and toast UI and emits achievement plugin intents', async () => {
    const pipeline = new Pipeline()
    const received: unknown[] = []
    pipeline.on(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, context => received.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, context => received.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, context => received.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, context => received.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, context => received.push(context.event.payload))

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        plugins: {
          [ACHIEVEMENT_PLUGIN_ID]: achievementProjection(),
        },
      }),
    })

    await flushVue()
    const achievementLayer = host.el.querySelector<HTMLElement>('.qua-achievement-layer')!
    const toastLayer = host.el.querySelector<HTMLElement>('.qua-achievement-toast-layer')!
    expect(host.el.querySelector('.qua-stage-overlay .qua-achievement-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-overlay .qua-achievement-toast-layer')).not.toBeNull()
    expect(achievementLayer.dataset.overlayStack).toBe('overlay')
    expect(achievementLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.achievementBoard))
    expect(toastLayer.dataset.overlayStack).toBe('toast')
    expect(toastLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast))
    expect(host.el.textContent).toContain('Achievements')
    expect(host.el.textContent).toContain('First Step')

    const search = host.el.querySelector<HTMLInputElement>('.qua-achievement-search-input')!
    search.value = 'cg'
    search.dispatchEvent(new Event('input'))
    host.el.querySelector<HTMLButtonElement>('[data-achievement-group-id="side"]')!.click()
    host.el.querySelector<HTMLButtonElement>('[data-achievement-id="cg.master"]')!.click()
    host.el.querySelector<HTMLButtonElement>('[data-achievement-notification-id="toast-1"]')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-achievement-close')!.click()
    await flushVue()

    expect(received).toEqual(expect.arrayContaining([
      { filter: { search: 'cg' } },
      { groupId: 'side' },
      { achievementId: 'cg.master' },
      { notificationId: 'toast-1' },
      {},
    ]))
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

  it('renders rich dialogue text with animated typography', async () => {
    const timestamp = Date.now()
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
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
          state: 'paused',
          startedAt: timestamp - 500,
          pausedAt: timestamp,
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

    await flushVue()

    const span = host.el.querySelector<HTMLElement>('[data-rich-text-span-id="keyword"]')
    expect(host.el.querySelector('.qua-dialogue-text')?.textContent).toBe('Hello World')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-color: rgb(128, 128, 128)')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-font-size: 30px')
    expect(span?.getAttribute('style')).toContain('--qua-rich-text-span-font-weight: 550')
  })

  it('reveals Vue dialogue with typewriter timing and completes it before advance', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => advances.push(payload))

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        dialogue: {
          visible: true,
          revision: 1,
          text: 'Hello',
          typewriter: { enabled: true, charactersPerSecond: 10 },
        },
      }),
    })

    try {
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()
      expect(host.el.querySelector('.qua-dialogue-text')?.textContent).toBe('')

      await vi.advanceTimersByTimeAsync(100)
      await nextTick()
      expect(host.el.querySelector('.qua-dialogue-text')?.textContent).toBe('H')

      host.el.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await flushMicrotasks()
      await nextTick()
      expect(host.el.querySelector('.qua-dialogue-text')?.textContent).toBe('Hello')
      expect(advances).toEqual([])

      host.el.querySelector('.qua-dialogue-box')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await vi.advanceTimersByTimeAsync(0)
      await flushMicrotasks()
      expect(advances).toEqual([{ source: 'pointer:dialogue' }])
    }
    finally {
      host.app.unmount()
    }
  })

  it('keeps Vue dialogue mounted during exit presence', async () => {
    vi.useFakeTimers()
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        dialogue: { visible: true, text: 'Line' },
      }),
    })

    try {
      await nextTick()
      expect(host.el.querySelector('.qua-dialogue-box')?.getAttribute('data-dialogue-presence')).toBe('enter')

      await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
        view: view({
          dialogue: { visible: false, text: '' },
        }),
      })
      await nextTick()

      expect(host.el.querySelector('.qua-dialogue-box')?.getAttribute('data-dialogue-presence')).toBe('exit')
      expect(host.el.querySelector('.qua-dialogue-text')?.textContent).toBe('Line')

      await vi.advanceTimersByTimeAsync(DEFAULT_DIALOGUE_PRESENCE_EXIT_MS)
      await nextTick()

      expect(host.el.querySelector('.qua-dialogue-box')).toBeNull()
    }
    finally {
      host.app.unmount()
    }
  })

  it('registers font assets through the Vue visual novel preset', async () => {
    const fontRuntime = installFakeFontFace()
    const assets = await createFontAssets()
    const host = mount(QuaRenderer, {
      pipeline: new Pipeline(),
      assets,
      plugins: createVisualNovelRendererPlugins(),
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
      await flushVue()

      expect(fontRuntime.created).toHaveLength(1)
      expect(fontRuntime.created[0]).toEqual(expect.objectContaining({
        family: 'Qua Serif',
        descriptors: expect.objectContaining({
          weight: '700',
          display: 'swap',
        }),
      }))
      expect(fontRuntime.add).toHaveBeenCalledWith(fontRuntime.created[0])
      expect(host.el.querySelector('.qua-dialogue-text')?.getAttribute('style')).toContain('--qua-rich-text-font-family: Qua Serif')

      host.app.unmount()
      await flushVue()
      expect(fontRuntime.delete).toHaveBeenCalledWith(fontRuntime.created[0])
    }
    finally {
      fontRuntime.restore()
      await assets.cleanup()
    }
  })

  it('fills portrait phone containers through the shared adaptive stage layout', async () => {
    const pipeline = new Pipeline()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(360, 780))
    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view({
        layout: createViewLayoutProjection('portrait'),
      }),
    })

    await flushVue()

    const viewportStyle = host.el.querySelector('.qua-stage-viewport')?.getAttribute('style') || ''
    const stageStyle = host.el.querySelector('.qua-stage')?.getAttribute('style') || ''
    const screenPlaneStyle = host.el.querySelector('.qua-screen-plane')?.getAttribute('style') || ''
    const overlayPlaneStyle = host.el.querySelector('.qua-stage-overlay')?.getAttribute('style') || ''

    expect(viewportStyle).toContain('width: 360px')
    expect(viewportStyle).toContain('height: 780px')
    expect(viewportStyle).toContain('left: 0px')
    expect(viewportStyle).toContain('top: 0px')
    expect(stageStyle).toContain('width: 1080px')
    expect(stageStyle).toContain('height: 2340px')
    expect(stageStyle).toContain('--qua-layout-aspect-ratio: 0.461538')
    expect(host.el.querySelector('.qua-stage-scene')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-scene-content')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-subject')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-plane')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-safe')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-overlay')).not.toBeNull()
    expect(host.el.querySelector('.qua-screen-plane')).not.toBeNull()
    expect(overlayPlaneStyle).toContain('pointer-events: none')
    expect(screenPlaneStyle).toContain('pointer-events: none')
  })

  it('remeasures the Vue stage after delayed container layout', async () => {
    const pipeline = new Pipeline()
    let measureCount = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
      measureCount += 1
      return measureCount === 1 ? rect(0, 0) : rect(360, 780)
    })
    const host = mount(QuaRenderer, {
      pipeline,
      initialView: view({
        layout: createViewLayoutProjection('portrait'),
      }),
    })

    await flushVue()
    await flushVue()

    const viewportStyle = host.el.querySelector('.qua-stage-viewport')?.getAttribute('style') || ''
    const stageStyle = host.el.querySelector('.qua-stage')?.getAttribute('style') || ''

    expect(viewportStyle).toContain('width: 360px')
    expect(viewportStyle).toContain('height: 780px')
    expect(stageStyle).toContain('width: 1080px')
  })

  it('mounts default UI content inside the shared safe-area plane', async () => {
    const pipeline = new Pipeline()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(780)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '30px',
      paddingRight: '0px',
      paddingBottom: '15px',
      paddingLeft: '0px',
    } as CSSStyleDeclaration)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(360, 780))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        layout: createViewLayoutProjection('portrait'),
        background: { mode: 'image', assetName: 'bg.png' },
        dialogue: { visible: true, text: 'Line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
      }),
    })

    await flushVue()

    const safeStyle = host.el.querySelector('.qua-stage-safe')?.getAttribute('style') || ''
    expect(host.el.querySelector('.qua-stage-scene-content .qua-background')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-safe .qua-dialogue-box')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-safe .qua-choice-panel')).not.toBeNull()
    expect(safeStyle).toContain('top: 90px')
    expect(safeStyle).toContain('height: 2205px')
  })

  it('does not mount default dialogue or choices when a UI scene disables default chrome', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        dialogue: { visible: true, text: 'Hidden line' },
        choices: [{ id: 'yes', text: 'Yes', enabled: true }],
        ui: {
          visible: true,
          overlays: {
            menu: {
              open: true,
              title: 'Menu',
              scene: {
                id: 'system:menu',
                presentation: 'scene',
                overlay: {
                  variant: 'main-menu',
                  defaultChrome: false,
                },
              },
            },
          },
        },
      }),
    })

    await flushVue()

    const layer = host.el.querySelector<HTMLElement>('.qua-overlay-layer')!
    expect(layer).not.toBeNull()
    expect(layer.dataset.uiSceneDefaultChrome).toBe('false')
    expect(host.el.querySelector('.qua-dialogue-box')).toBeNull()
    expect(host.el.querySelector('.qua-choice-panel')).toBeNull()
    expect(host.el.textContent).not.toContain('Hidden line')
    expect(host.el.textContent).not.toContain('Yes')
  })

  it('renders registered render-only overlay components without default UI chrome', async () => {
    const pipeline = new Pipeline()
    const RainCanvasOverlay = defineComponent({
      name: 'RainCanvasOverlay',
      props: {
        elementId: String,
        surface: Object as any,
      },
      setup(props) {
        return () => h('canvas', {
          class: 'rain-canvas',
          'data-overlay': props.elementId,
          'data-density': String((props.surface as any)?.props?.density),
        })
      },
    })
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins({
        ui: {
          renderOnlySurfaces: {
            'fx/rain-canvas': RainCanvasOverlay,
          },
        },
      }),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            rain: {
              renderMode: 'render-only',
              interactive: false,
              surface: {
                key: 'fx/rain-canvas',
                props: { density: 0.7 },
              },
              zIndex: 120,
            },
          },
        },
      }),
    })

    await flushVue()

    const layer = host.el.querySelector<HTMLElement>('.qua-overlay-layer')!
    const overlay = host.el.querySelector<HTMLElement>('.qua-ui-overlay--render-only')!
    expect(host.el.querySelector<HTMLCanvasElement>('.rain-canvas')?.dataset.density).toBe('0.7')
    expect(host.el.querySelector('.qua-ui-panel-header')).toBeNull()
    expect(overlay.dataset.overlay).toBe('rain')
    expect(overlay.dataset.overlayRenderMode).toBe('render-only')
    expect(overlay.dataset.overlaySurfaceKey).toBe('fx/rain-canvas')
    expect(layer.getAttribute('style')).toContain('pointer-events: none')
    expect(overlay.getAttribute('style')).toContain('pointer-events: none')
  })

  it('does not turn nested renderer or plugin UI clicks into duplicate advance intents', async () => {
    const pipeline = new Pipeline()
    const advances: Array<{ source?: string }> = []
    const commands: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => commands.push(`${payload.command}:${payload.source}`))
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
      { source: 'pointer:dialogue' },
      { source: 'pointer:stage' },
    ])
    expect(commands).toEqual([
      'advance:pointer:dialogue',
      'advance:pointer:stage',
    ])
  })

  it('wires the input Vue plugin as a thin adapter over renderer-web actions', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, payload => received.push(`command:${payload.command}:${payload.source}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => received.push(`advance:${payload.source}`))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins({ input: { pointer: false, gamepad: false } }),
      initialView: view(),
    })

    await flushVue()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true }))
    await flushVue()

    expect(received).toEqual([
      'command:advance:keyboard:Enter',
      'advance:keyboard:Enter',
      'command:advance:keyboard:ArrowRight',
      'advance:keyboard:ArrowRight',
      'command:advance:keyboard:ArrowDown',
      'advance:keyboard:ArrowDown',
    ])

    host.app.unmount()
    await flushVue()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))
    await flushVue()

    expect(received).toHaveLength(6)
  })

  it('exposes a standalone input Vue plugin without duplicating renderer-web runtime', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.USER_ADVANCE, payload => received.push(payload.source || ''))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: [createInputRendererPlugin({ pointer: false, gamepad: false })],
      initialView: view(),
    })

    await flushVue()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))
    await flushVue()

    expect(received).toEqual(['keyboard:Space'])
    expect(createInputRendererPlugin().name).toBe('@quajs/renderer-vue/input')
    const input = await import('../src/plugins/input')
    expect(typeof input.createInputWebRendererPlugin).toBe('function')
    const shared = await import('../src/plugins/shared')
    expect(typeof shared.createUiOverlayStackBinding).toBe('function')
    const savePreview = await import('../src/save-preview')
    expect(typeof savePreview.WebSaveSlotPreviewCache).toBe('function')

    host.app.unmount()
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

  it('renders story tree UI with custom classes and emits user intents', async () => {
    const selected: string[] = []
    const closed: string[] = []
    const host = mount(QuaStoryTree, {
      class: 'native-story-class',
      className: 'custom-story-class',
      panelClassName: 'custom-story-panel',
      nodesClassName: 'custom-story-nodes',
      nodeClassName: 'custom-story-node',
      closeButtonClassName: 'custom-story-close',
      selectable: true,
      nodes: [
        { id: 'start', chapter: '00', title: 'Start', description: 'Opening', state: 'current' },
        { id: 'locked', chapter: '01', title: 'Locked', state: 'locked', entryLocked: true, spoilerHidden: true },
        { id: 'hidden', chapter: '02', title: 'Hidden', state: 'locked', hidden: true },
      ],
      onClose: () => closed.push('close'),
      onSelect: (node: { id: string }) => selected.push(node.id),
    })

    await flushVue()

    const root = host.el.querySelector<HTMLElement>('.qua-story-tree')!
    expect(root.classList.contains('native-story-class')).toBe(true)
    expect(root.classList.contains('custom-story-class')).toBe(true)
    expect(host.el.querySelector('.custom-story-panel')).not.toBeNull()
    expect(host.el.querySelector('.custom-story-nodes')).not.toBeNull()
    expect(host.el.querySelectorAll('.custom-story-node')).toHaveLength(2)
    expect(host.el.querySelector('[data-story-tree-node-id="hidden"]')).toBeNull()
    expect(host.el.querySelectorAll('.qua-story-tree__node-button')).toHaveLength(1)
    expect(host.el.querySelector('[data-story-tree-node-id="locked"]')?.getAttribute('data-story-tree-node-entry-locked')).toBe('true')
    expect(host.el.querySelector('[data-story-tree-node-id="locked"]')?.textContent).toContain('LOCKED')
    host.el.querySelector<HTMLButtonElement>('.qua-story-tree__node-button')!.click()
    host.el.querySelector<HTMLButtonElement>('.custom-story-close')!.click()
    await flushVue()

    expect(selected).toEqual(['start'])
    expect(closed).toEqual(['close'])
  })

  it('renders default menu overlay content and emits shell intents', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_CLOSE, payload => received.push(`close:${payload.elementId}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_OPEN, payload => received.push(`open:${payload.elementId}:${(payload.config as any)?.mode || ''}`))
    pipeline.on(BacklogRenderToLogicEvents.OPEN_REQUEST, () => received.push('backlog:open'))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            menu: { open: true, title: 'Pause' },
          },
        },
      }),
    })

    await flushVue()
    expect(host.el.querySelector('.qua-overlay-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-screen-plane .qua-overlay-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-overlay .qua-overlay-layer')).toBeNull()
    const overlayLayer = host.el.querySelector<HTMLElement>('.qua-overlay-layer')!
    expect(overlayLayer.getAttribute('style')).toContain('pointer-events: auto')
    expect(overlayLayer.dataset.overlayStack).toBe('overlay')
    expect(overlayLayer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.ui))
    expect(host.el.querySelector('.qua-menu-overlay')?.textContent).toContain('Pause')
    expect(host.el.querySelector('.qua-menu-footer')).not.toBeNull()

    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--continue')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--save')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--load')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--settings')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--backlog')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--title')!.click()
    await flushVue()

    expect(received).toEqual([
      'close:menu',
      'open:saveLoad:save',
      'open:saveLoad:load',
      'open:settings:',
      'backlog:open',
      'open:titleConfirm:',
    ])
  })

  it('can replace the menu when opening a child UI scene target', async () => {
    const pipeline = new Pipeline()
    const received: Array<Record<string, unknown>> = []
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_CLOSE, payload => received.push({
      type: 'close',
      elementId: payload.elementId,
    }))
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_OPEN, payload => received.push({
      type: 'open',
      elementId: payload.elementId,
      mode: (payload.config as any)?.mode,
      sceneId: (payload.config as any)?.scene?.id,
      scenePresentation: (payload.config as any)?.scene?.presentation,
      sceneOverlayVariant: (payload.config as any)?.scene?.overlay?.variant,
    }))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            menu: {
              open: true,
              replaceOnOpen: true,
              scene: {
                id: 'game:menu',
                presentation: 'overlay',
                overlay: {
                  variant: 'game-modal',
                  hideHud: true,
                  hideDialogue: true,
                },
              },
            },
          },
        },
      }),
    })

    await flushVue()
    host.el.querySelector<HTMLButtonElement>('.qua-menu-action--save')!.click()
    await flushVue()

    expect(received).toEqual([
      {
        type: 'open',
        elementId: 'saveLoad',
        mode: 'save',
        sceneId: 'game:menu/saveLoad:save',
        scenePresentation: 'overlay',
        sceneOverlayVariant: 'game-modal',
      },
      {
        type: 'close',
        elementId: 'menu',
      },
    ])
  })

  it('can hide menu flow controls when the menu is opened from a quick HUD', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            menu: { open: true, showFlowControls: false },
          },
        },
      }),
    })

    await flushVue()

    expect(host.el.querySelector('.qua-menu-footer')).toBeNull()
    expect(host.el.querySelector('.qua-menu-action--save')).not.toBeNull()
    expect(host.el.querySelector('.qua-menu-action--load')).not.toBeNull()
  })

  it('projects UI scene metadata onto the overlay host layer', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            saveLoad: {
              open: true,
              mode: 'load',
              scene: {
                id: 'system:load',
                presentation: 'scene',
                overlay: {
                  variant: 'main-menu',
                  hideHud: true,
                  hideDialogue: true,
                },
              },
            },
          },
        },
      }),
    })

    await flushVue()

    const layer = host.el.querySelector<HTMLElement>('.qua-overlay-layer')!
    expect(layer.dataset.uiSceneId).toBe('system:load')
    expect(layer.dataset.uiScenePresentation).toBe('scene')
    expect(layer.dataset.uiSceneOverlayVariant).toBe('main-menu')
    expect(layer.dataset.uiSceneHideHud).toBe('true')
    expect(layer.dataset.uiSceneHideDialogue).toBe('true')
  })

  it('renders confirm overlays and emits configured confirm events', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    pipeline.on(UI_TITLE_REQUEST_EVENT, () => received.push('title:request'))
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_CLOSE, payload => received.push(`close:${payload.elementId}`))
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            titleConfirm: {
              open: true,
              title: 'Return?',
              description: 'Confirm navigation.',
              confirmLabel: 'Title',
              confirmEvent: UI_TITLE_REQUEST_EVENT,
            },
          },
        },
      }),
    }, {
      overlay: () => h(QuaConfirmOverlay, { elementId: 'titleConfirm' }),
    })

    await flushVue()
    expect(host.el.querySelector('.qua-confirm-overlay')?.textContent).toContain('Return?')

    host.el.querySelector<HTMLButtonElement>('.qua-confirm-action--confirm')!.click()
    await flushVue()

    expect(received).toEqual([
      'title:request',
      'close:titleConfirm',
    ])
  })

  it('renders default save/load slots and emits save/load intents', async () => {
    const pipeline = new Pipeline()
    const received: string[] = []
    onRenderToLogic(pipeline, RenderToLogicEvents.GAME_SAVE_REQUEST, payload => received.push(`save:${payload.slotId || 'quick'}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.GAME_LOAD_REQUEST, payload => received.push(`load:${payload.slotId || 'quick'}`))
    onRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_UPDATE, payload => received.push(`update:${payload.elementId}:${(payload.config as any).mode}`))
    const current = view({
      ui: {
        visible: true,
        overlays: {
          saveLoad: {
            open: true,
            mode: 'load',
            slotCount: 2,
            slots: [{
              slotId: 'slot-1',
              name: 'Classroom',
              timestamp: '2026-05-25T00:00:00Z',
              metadata: {
                sceneName: 'opening',
                stepId: 'line-1',
                playtime: 120000,
              },
            }],
          },
        },
      },
    })
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: current,
    })

    await flushVue()
    expect(host.el.querySelectorAll('.qua-save-slot-button')).toHaveLength(2)
    expect(host.el.textContent).toContain('Classroom')

    host.el.querySelector<HTMLButtonElement>('[data-save-slot-id="slot-1"]')!.click()
    host.el.querySelector<HTMLButtonElement>('[data-save-slot-id="slot-2"]')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-save-load-mode-tab')!.click()
    host.el.querySelector<HTMLButtonElement>('.qua-save-load-quick-action')!.click()
    await flushVue()

    expect(received).toEqual([
      'load:slot-1',
      'update:saveLoad:save',
      'save:quick',
    ])
  })

  it('can hide generic panel headings while keeping the close action', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            saveLoad: {
              open: true,
              mode: 'load',
              showHeaderTitle: false,
              slotCount: 1,
            },
          },
        },
      }),
    })

    await flushVue()

    expect(host.el.querySelector('.qua-ui-panel-header')?.classList.contains('is-heading-hidden')).toBe(true)
    expect(host.el.querySelector('.qua-ui-panel-title')).toBeNull()
    expect(host.el.querySelector('.qua-ui-panel-subtitle')).toBeNull()
    expect(host.el.querySelector('.qua-ui-panel-close')).not.toBeNull()
  })

  it('keeps save/load wrapper slot overrides available', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            saveLoad: {
              open: true,
              mode: 'save',
              slotCount: 1,
            },
          },
        },
      }),
    }, {
      stage: () => h(QuaSaveLoadPanel, undefined, {
        default: ({ mode, slots }: any) => h('div', `custom ${mode} ${slots.length}`),
      }),
    })

    await flushVue()

    expect(host.el.textContent).toContain('custom save 1')
  })

  it('falls back to the default settings panel when the settings layer is not mounted', async () => {
    const pipeline = new Pipeline()
    const plugins = createVisualNovelRendererPlugins()
      .filter(plugin => plugin.name !== '@quajs/renderer-vue/settings')
    const host = mount(QuaRenderer, {
      pipeline,
      plugins,
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

    await flushVue()

    expect(host.el.querySelector('.qua-settings-panel')).not.toBeNull()
    expect(host.el.textContent).toContain('Playback')
    expect(host.el.textContent).toContain('No audio projection')
    expect(host.el.textContent).not.toContain('Text Speed')
  })

  it('does not render a generic settings overlay when the dedicated settings layer is mounted', async () => {
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        ui: {
          visible: true,
          overlays: {
            settings: {
              open: true,
              title: 'Config',
              scene: {
                id: 'system:settings',
                presentation: 'scene',
                overlay: {
                  variant: 'main-menu',
                  hideHud: true,
                  hideDialogue: true,
                },
              },
            },
          },
        },
        plugins: {
          [SETTINGS_PLUGIN_ID]: settingsProjection(),
        },
      }),
    })

    await flushVue()

    expect(host.el.querySelector('.qua-settings-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-screen-plane .qua-settings-layer')).not.toBeNull()
    expect(host.el.querySelector('.qua-stage-overlay .qua-settings-layer')).toBeNull()
    expect(host.el.querySelector('.qua-settings-layer')?.getAttribute('style')).toContain('pointer-events: auto')
    expect(host.el.querySelector('.qua-overlay-layer')).toBeNull()
    expect(host.el.querySelector('.qua-ui-overlay[data-overlay="settings"]')).toBeNull()
    const layer = host.el.querySelector<HTMLElement>('.qua-settings-layer')!
    expect(layer.dataset.overlayStack).toBe('overlay')
    expect(layer.dataset.overlayZIndex).toBe(String(DEFAULT_UI_OVERLAY_Z_INDEXES.settings))
    expect(layer.dataset.uiSceneId).toBe('system:settings')
    expect(layer.dataset.uiScenePresentation).toBe('scene')
    expect(layer.dataset.uiSceneOverlayVariant).toBe('main-menu')
    expect(host.el.textContent).toContain('Text Speed')
  })

  it('applies ui skins to vue settings toggles and sprite skin boxes', async () => {
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:vue-ui-skin:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-vue-ui-skin-test',
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
    const host = mount(QuaRenderer, {
      pipeline,
      assets,
      plugins: createVisualNovelRendererPlugins(),
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
            settings: { open: true },
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
    }, {
      stage: () => h('div', [
        h(QuaSpriteSkinBox, {
          kind: 'button',
          skinId: 'button',
          as: 'button',
        }, {
          default: () => 'Skin Box',
        }),
        h(QuaSettingsLayer),
      ]),
    })

    await flushVue()
    await flushVue()
    await flushVue()

    await waitForStyle(() => host.el.querySelector<HTMLButtonElement>('.qua-sprite-skin-box'), style => style.includes('border-image-slice: 4 4 4 4'))
    const box = host.el.querySelector<HTMLButtonElement>('.qua-sprite-skin-box')
    expect(box?.dataset.skinState).toBe('default')
    const initialStyle = box?.getAttribute('style') || ''
    expect(initialStyle).toContain('border-image-slice: 4 4 4 4')
    expect(initialStyle).toContain('--qua-skin-source-current')

    box!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushVue()
    await flushVue()
    expect(box?.dataset.skinState).toBe('hover')

    const toggle = host.el.querySelector<HTMLInputElement>('[data-settings-field="confirmBeforeQuit"] input[type="checkbox"]')
    expect(toggle?.dataset.skinState).toBe('selected')

    await host.app.unmount()
    await flushAssetUrlRevokeGrace()
    expect(revoke).toHaveBeenCalled()
    expect(create).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('renders schema-driven settings forms and emits settings update intents', async () => {
    const pipeline = new Pipeline()
    const updates: unknown[] = []
    pipeline.on(SettingsRenderToLogicEvents.UPDATE_REQUEST, context => updates.push(context.event.payload))
    const ShaderPicker = defineComponent({
      name: 'ShaderPicker',
      props: {
        update: {
          type: Function,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
      },
      setup(props) {
        return () => h('button', {
          class: 'shader-picker',
          type: 'button',
          onClick: () => props.update('crisp'),
        }, props.value)
      },
    })
    const plugins = [
      ...createVisualNovelRendererPlugins().filter(plugin => plugin.name !== '@quajs/renderer-vue/settings'),
      createSettingsRendererPlugin({
        customControls: {
          ShaderPicker,
        },
      }),
    ]
    const host = mount(QuaRenderer, {
      pipeline,
      plugins,
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

    await flushVue()

    expect(host.el.querySelector('.qua-settings-panel')).not.toBeNull()
    expect(host.el.textContent).toContain('System')
    expect(host.el.textContent).toContain('Text Speed')
    expect(host.el.querySelector('[data-settings-field="textSpeedCps"]')?.getAttribute('data-settings-control')).toBe('slider')
    expect(host.el.querySelector('[data-settings-field="textSpeedCps"] .qua-settings-field-main')).not.toBeNull()

    const textSpeed = host.el.querySelector<HTMLInputElement>('[data-settings-field="textSpeedCps"] input')
    expect(textSpeed?.classList.contains('qua-settings-control')).toBe(true)
    textSpeed!.value = '72'
    textSpeed!.dispatchEvent(new Event('input'))
    await flushVue()
    expect(updates).toEqual([])

    textSpeed!.dispatchEvent(new Event('change'))
    await flushVue()

    const skipMode = host.el.querySelector<HTMLSelectElement>('[data-settings-field="skipMode"] select')
    skipMode!.value = JSON.stringify('all')
    skipMode!.dispatchEvent(new Event('change'))
    await flushVue()

    const layout = host.el.querySelector<HTMLTextAreaElement>('[data-settings-field="layout"] textarea')
    layout!.value = JSON.stringify({ gap: 16 })
    layout!.dispatchEvent(new Event('change'))
    await flushVue()

    const shader = host.el.querySelector<HTMLButtonElement>('[data-settings-field="shader"] .shader-picker')
    expect(shader?.textContent).toBe('soft')
    shader!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushVue()

    expect(updates).toEqual([
      { scope: 'system', patch: { textSpeedCps: 72 } },
      { scope: 'system', patch: { skipMode: 'all' } },
      { scope: 'system', patch: { layout: { gap: 16 } } },
      { scope: 'system', patch: { shader: 'crisp' } },
    ])
  })

  it('lets apps replace schema settings pieces through slots', async () => {
    const pipeline = new Pipeline()
    const updates: unknown[] = []
    const resets: unknown[] = []
    pipeline.on(SettingsRenderToLogicEvents.UPDATE_REQUEST, context => updates.push(context.event.payload))
    pipeline.on(SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, context => resets.push(context.event.payload))

    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins().filter(plugin => plugin.name !== '@quajs/renderer-vue/settings'),
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
    }, {
      stage: () => h(QuaSettingsLayer, undefined, {
        'form-header': ({ form }: any) => h('header', { class: 'custom-settings-header' }, form.profileId),
        'scope-header': ({ scope, resetScope }: any) => h('button', {
          class: 'custom-scope-reset',
          type: 'button',
          onClick: resetScope,
        }, scope.title),
        'group-header': ({ group }: any) => h('div', { class: 'custom-settings-group' }, group.id),
        'field-label': ({ field }: any) => h('span', { class: 'custom-settings-label' }, field.name),
        'field-control': (payload: any) => {
          if (payload.field.pathKey !== 'textSpeedCps') {
            return undefined
          }
          return h('button', {
            class: 'custom-text-speed',
            type: 'button',
            onClick: () => payload.update(88),
          }, `${payload.inputId}:${payload.value}`)
        },
      }),
    })

    await flushVue()

    expect(host.el.querySelector('.custom-settings-header')?.textContent).toBe('default')
    expect(host.el.querySelector('.custom-scope-reset')?.textContent).toBe('System')
    expect(host.el.querySelector('.custom-settings-group')?.textContent).toBe('default')
    expect(host.el.querySelector('.custom-settings-label')?.textContent).toBe('textSpeedCps')
    expect(host.el.querySelector('.custom-text-speed')?.textContent).toContain('qua-settings-system-textSpeedCps')
    expect(host.el.querySelector('[data-settings-field="textSpeedCps"] input')).toBeNull()

    host.el.querySelector<HTMLButtonElement>('.custom-text-speed')!.click()
    await flushVue()
    host.el.querySelector<HTMLButtonElement>('.custom-scope-reset')!.click()
    await flushVue()

    expect(updates).toEqual([
      { scope: 'system', patch: { textSpeedCps: 88 } },
    ])
    expect(resets).toEqual([
      { scope: 'system' },
    ])
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
      plugins: current.plugins,
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

    expect(host.el.querySelector('.qua-stage-subject .qua-character')).not.toBeNull()
    expect(host.el.querySelector('.qua-character')?.getAttribute('style')).toContain('--qua-character-x: 25')
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toContain('--qua-background-x: 10')
  })

  it('keeps hidden Vue characters mounted for their exit transition', async () => {
    vi.useFakeTimers()
    const pipeline = new Pipeline()
    const host = mount(QuaRenderer, {
      pipeline,
      plugins: createVisualNovelRendererPlugins({
        character: {
          transitions: {
            enterDurationMs: 40,
            exitDurationMs: 30,
          },
        },
      }),
      initialView: view({
        characters: [{ id: 'Alice', name: 'Alice', visible: true, position: { x: 960, y: 540 } }],
      }),
    })

    await nextTick()

    const layer = host.el.querySelector<HTMLElement>('.qua-character-layer')
    expect(layer?.dataset.characterTransitions).toBe('enabled')
    expect(layer?.getAttribute('style')).toContain('--qua-character-enter-duration: 40ms')
    expect(layer?.getAttribute('style')).toContain('--qua-character-exit-duration: 30ms')
    expect(host.el.querySelector('.qua-character')?.getAttribute('data-character-presence')).toBe('enter')

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, {
      view: view({
        characters: [{ id: 'Alice', name: 'Alice', visible: false, position: { x: 960, y: 540 } }],
      }),
    })
    await nextTick()

    expect(host.el.querySelector('.qua-character')?.getAttribute('data-character-presence')).toBe('exit')

    vi.advanceTimersByTime(30)
    await nextTick()

    expect(host.el.querySelector('.qua-character')).toBeNull()

    host.app.unmount()
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
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toContain('position: absolute')
    expect(host.el.querySelector('.qua-background')?.getAttribute('style')).toContain('object-fit: cover')
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
          {
            id: 'clouds',
            assetName: 'clouds.png',
            assetType: 'images',
            zIndex: 2,
            composition: {
              blendMode: 'screen',
              filter: { blur: 3 },
              mask: { assetName: 'cloud-mask.png', position: 'center' },
            },
          },
        ],
      },
      dialogue: { visible: true, text: 'Line' },
    })

    await emitLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, { view: current })

    await flushVue()

    expect(host.el.querySelectorAll('.qua-background-layer-item').length).toBe(2)
    const clouds = host.el.querySelector('[data-background-layer-id="clouds"]') as HTMLElement
    expect(clouds.getAttribute('style')).toContain('width: 100%')
    expect(clouds.getAttribute('style')).toContain('--qua-background-layer-blend-mode: screen')
    expect(clouds.getAttribute('style')).toContain('filter: blur(3px)')
  })

  it('resolves layered background masks from the background runtime package', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vue-background-mask')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const requestedPackages: Array<string | undefined> = []
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-vue-background-mask-test',
        storage: new MemoryAssetStorage(),
        crypto: { sha256: async () => '' },
      },
      provider: {
        mode: 'memory',
        getManifest: async () => ({
          version: '1',
          assets: [
            imageManifestRecord('other-mask', 'shared-mask.png', 'runtime.other', 100),
            imageManifestRecord('runtime-mask', 'shared-mask.png', 'runtime.mask', 1),
          ],
        }),
        getAsset: async (_id, record) => {
          requestedPackages.push(record?.runtimePackageId)
          return asset(record?.name || 'shared-mask.png', 'images', 'image/png')
        },
      },
    })
    await assets.initialize()

    const host = mount(QuaRenderer, {
      pipeline: new Pipeline(),
      assets,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        background: {
          mode: 'layered',
          metadata: { contentPackageId: 'runtime.mask' },
          composition: {
            mask: { assetName: 'shared-mask.png', position: 'center' },
          },
          layers: [],
        },
      }),
    })

    for (let index = 0; index < 20 && requestedPackages.length === 0; index += 1) {
      await flushVue()
    }

    expect(requestedPackages).toEqual(['runtime.mask'])
    expect(create).toHaveBeenCalled()

    host.app.unmount()
    await assets.cleanup()
    create.mockRestore()
    revoke.mockRestore()
  })

  it('renders sprite expressions through the dedicated sprite capability', async () => {
    const pipeline = new Pipeline()
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:sprite:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-sprite-test',
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

    const host = mount(QuaRenderer, {
      pipeline,
      assets,
      plugins: createVisualNovelRendererPlugins(),
      initialView: view({
        characters: [{
          id: 'Alice',
          name: 'Alice',
          visible: true,
          sprite: 'alice/base.png',
          expression: 'happy',
        }],
      }),
    })

    await flushVue()
    await flushVue()

    const character = host.el.querySelector('.qua-character')
    expect(character).not.toBeNull()
    expect(character?.getAttribute('data-sprite-family')).toBe('alice')
    expect(character?.getAttribute('data-sprite-expression')).toBe('happy')
    expect(host.el.querySelectorAll('.qua-sprite-layer').length).toBe(2)
    expect(host.el.querySelectorAll('.qua-sprite-layer--expression').length).toBe(1)
    expect(create).toHaveBeenCalled()

    host.app.unmount()
    await flushAssetUrlRevokeGrace()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('resolves character sprite assets from the character runtime package', async () => {
    const pipeline = new Pipeline()
    const requestedPackages: Array<string | undefined> = []
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:runtime-sprite')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-runtime-sprite-test',
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

    const host = mount(QuaRenderer, {
      pipeline,
      assets,
      plugins: createVisualNovelRendererPlugins(),
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

    await flushVue()
    await flushVue()

    expect(requestedPackages.length).toBeGreaterThan(0)
    expect(requestedPackages.every(packageId => packageId === 'runtime.sprite')).toBe(true)
    expect(create).toHaveBeenCalled()

    host.app.unmount()
    await flushAssetUrlRevokeGrace()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
  })

  it('resolves sprite deltas through required runtime package candidates', async () => {
    const pipeline = new Pipeline()
    const requestedAssets: Array<{ name: string, packageId?: string }> = []
    let urlIndex = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:runtime-sprite-delta:${++urlIndex}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const assets = new QuaAssets({
      adapter: {
        name: 'renderer-runtime-sprite-delta-test',
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

    const host = mount(QuaRenderer, {
      pipeline,
      assets,
      plugins: createVisualNovelRendererPlugins(),
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

    await flushVue()
    await flushVue()

    expect(requestedAssets).toContainEqual({ name: 'alice/sprite.manifest.json', packageId: 'runtime.delta-sprite' })
    expect(requestedAssets).toContainEqual({ name: 'alice/base.png', packageId: 'runtime.base-sprite' })
    expect(requestedAssets).toContainEqual({ name: 'alice/happy.png', packageId: 'runtime.delta-sprite' })
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(2)

    host.app.unmount()
    await flushAssetUrlRevokeGrace()
    expect(revoke).toHaveBeenCalled()
    await assets.cleanup()
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

    expect(received).toEqual([])
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
    await flushAssetUrlRevokeGrace()
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
    expect(create).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()

    host.app.unmount()
    await flushAssetUrlRevokeGrace()
    expect(revoke).toHaveBeenCalledWith('blob:first')
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
    await flushAssetUrlRevokeGrace()
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
    await flushAssetUrlRevokeGrace()
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

async function flushAssetUrlRevokeGrace(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 300))
  await flushVue()
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForStyle(
  getElement: () => HTMLElement | null | undefined,
  predicate: (style: string) => boolean,
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const element = getElement()
    if (element && predicate(element.getAttribute('style') || '')) {
      return
    }
    await flushVue()
  }
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

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
          title: 'Sunset Note',
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

function galleryProjectionWithImage(): GalleryProjection {
  const projection = galleryProjection()
  return {
    ...projection,
    entries: projection.entries.map(entry => entry.id === 'cg.sunset'
      ? {
          ...entry,
          contents: [{
            id: 'cg.sunset.image',
            kind: 'image',
            title: 'Sunset Image',
            asset: { type: 'images', name: 'sunset.png' },
          }],
        }
      : entry),
    selectedContentId: 'cg.sunset.image',
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

function imageManifestRecord(id: string, name: string, runtimePackageId: string, bundlePriority: number) {
  return {
    id,
    bundleName: runtimePackageId,
    bundlePriority,
    runtimePackageId,
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

async function createFontAssets(): Promise<QuaAssets> {
  const assets = new QuaAssets({
    adapter: {
      name: 'renderer-vue-font-test',
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
