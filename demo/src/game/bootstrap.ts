import { DEMO_HUD_ACTIONS, DEMO_MENU_OPTIONS, DEMO_TITLE_CONFIRM, toggleDemoFlowControl } from './ui-presentation'
import { RenderToLogicEvents, LogicToRenderEvents, onLogicToRender, type GameOverPayload } from '@quajs/engine'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents, type BacklogProjection } from '@quajs/plugin-backlog'
import { GALLERY_PLUGIN_ID, type GalleryProjection } from '@quajs/plugin-gallery'
import { resolveActiveUiSceneProjection, uiSceneAllowsDialogueChrome, uiSceneAllowsHudChrome, type ViewUiSceneProjection } from '@quajs/render-core'
import { DialoguePresenceRuntime } from '@quajs/renderer-web'
import { QuaRenderer, type QuaVueRendererPlugin } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { QuaBacklogLayer } from '@quajs/renderer-vue/plugins/backlog'
import { QuaSettingsLayer } from '@quajs/renderer-vue/plugins/settings'
import { QuaStoryTree } from '@quajs/renderer-vue/plugins/ui'
import type { StoryChapterSelectProjection } from '@quajs/story-graph'
import { computed, defineComponent, Fragment, h, onBeforeUnmount, ref, watch } from 'vue'
import {
  DEMO_TITLE_REQUEST_EVENT,
  GAME_ENGLISH_TITLE,
  GAME_TITLE,
  SAVE_LOAD_SLOT_COUNT,
} from './config'
import { STORY_TREE_NODES } from './content/story-tree'
import { createDemoRuntime } from './runtime'
import { DEMO_STORY_REQUEST, DEMO_STORY_ERROR, DEMO_LIBRARY_PLUGIN_ID, type StoryLibrary, type StoryRequest } from './story/prologue-state'
import { DemoSystemPanels } from './ui/system-panels'
import { DemoBacklogPanel } from './ui/backlog'
import type { DemoHud, DemoToast, HudPatch } from './types'
import { createUiScene, DEMO_OVERLAY_PLACEMENTS, parseChapterIndex, slotLabel } from './ui/scene'
import {
  renderDemoSettingsActions,
  renderDemoSettingsLabel,
  renderDemoSettingsDescription,
  renderDemoSettingsGroupHeader,
  renderDemoSettingsControl,
  renderDemoSettingsHeader,
  renderDemoSettingsScopeHeader,
} from './ui/settings'
import { countUnlockedStoryTreeNodes, projectDemoStoryTreeNodes, renderDemoChapter } from './ui/story-tree'

const UI_SCENE_EXIT_HOLD_MS = 190

export async function createQuaGameApp() {
  const bootMessage = ref('加载中……')
  const showMainMenu = ref(true)
  const showStoryTree = ref(false)
  const returnToMainMenuOverlay = ref<string>()
  const toast = ref<DemoToast>()
  const currentChapterIndex = ref(-1)
  const storyChapterSelect = ref<StoryChapterSelectProjection>({ nodes: [] })
  const hud = ref<DemoHud>({
    chapter: '00',
    route: '雨天来客',
    signal: '0',
  })
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const storyTreeNodes = computed(() =>
    projectDemoStoryTreeNodes(storyChapterSelect.value, currentChapterIndex.value),
  )
  const unlockedStoryTreeCount = computed(() => countUnlockedStoryTreeNodes(storyChapterSelect.value))

  const showToast = (message: string, tone: DemoToast['tone'] = 'info') => {
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toast.value = {
      id: Date.now(),
      message,
      tone,
    }
    toastTimer = setTimeout(() => {
      toast.value = undefined
      toastTimer = undefined
    }, 2400)
  }

  const updateHud = (patch: HudPatch) => {
    const next = { ...hud.value, ...patch }
    hud.value = next
    const chapterIndex = parseChapterIndex(next.chapter)
    if (chapterIndex >= 0) {
      currentChapterIndex.value = chapterIndex
    }
  }

  bootMessage.value = '加载中……'
  const { assets, engine, runtimePluginLoader, storyGraph } = await createDemoRuntime()
  const syncStoryTreeProjection = () => {
    storyChapterSelect.value = storyGraph.getChapterSelectProjection()
  }
  syncStoryTreeProjection()
  const activeView = ref(engine.getViewState())
  const library = computed(() => activeView.value.plugins[DEMO_LIBRARY_PLUGIN_ID] as StoryLibrary | undefined)
  const activeBacklog = computed(() => activeView.value.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined)
  const activeGallery = computed(() => activeView.value.plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined)
  const galleryOpenedFromMainMenu = ref(false)
  const activeUiScene = computed<ViewUiSceneProjection | undefined>(() => {
    return resolveActiveUiSceneProjection(activeView.value.ui.overlays)
      || (activeBacklog.value?.visible ? (activeBacklog.value.ui?.scene as ViewUiSceneProjection | undefined) : undefined)
  })
  const renderedActiveUiScene = ref<ViewUiSceneProjection | undefined>(activeUiScene.value)
  let activeUiSceneExitTimer: ReturnType<typeof setTimeout> | undefined
  const clearActiveUiSceneExitTimer = () => {
    if (activeUiSceneExitTimer) {
      clearTimeout(activeUiSceneExitTimer)
      activeUiSceneExitTimer = undefined
    }
  }
  const stopActiveUiSceneWatch = watch(activeUiScene, (nextScene, previousScene) => {
    clearActiveUiSceneExitTimer()
    if (nextScene) {
      renderedActiveUiScene.value = nextScene
      return
    }
    if (previousScene) {
      renderedActiveUiScene.value = previousScene
      activeUiSceneExitTimer = setTimeout(() => {
        activeUiSceneExitTimer = undefined
        if (!activeUiScene.value) {
          renderedActiveUiScene.value = undefined
        }
      }, UI_SCENE_EXIT_HOLD_MS)
      return
    }
    renderedActiveUiScene.value = undefined
  }, { immediate: true })
  const systemOverlayMode = computed<'main' | 'game' | undefined>(() => {
    if (activeGallery.value?.sceneActive) {
      return galleryOpenedFromMainMenu.value ? 'main' : 'game'
    }
    if (renderedActiveUiScene.value?.overlay?.variant === 'main-menu') {
      return 'main'
    }
    return renderedActiveUiScene.value ? 'game' : undefined
  })
  const titleSurfaceActive = computed(() =>
    showMainMenu.value
    || showStoryTree.value
    || systemOverlayMode.value === 'main'
    || galleryOpenedFromMainMenu.value
    || Boolean(returnToMainMenuOverlay.value),
  )
  const hudChromeVisible = computed(() =>
    !titleSurfaceActive.value
    && !activeGallery.value?.sceneActive
    && uiSceneAllowsHudChrome(renderedActiveUiScene.value),
  )
  const dialogueChromeAllowed = computed(() =>
    !titleSurfaceActive.value
    && uiSceneAllowsDialogueChrome(renderedActiveUiScene.value),
  )
  const dialogueChromeRefresh = ref(0)
  const dialogueChromePresenceRuntime = new DialoguePresenceRuntime({
    refresh: () => {
      dialogueChromeRefresh.value += 1
    },
  })
  const dialogueChromePresence = computed(() => {
    void dialogueChromeRefresh.value
    return dialogueChromePresenceRuntime.project(activeView.value.dialogue, dialogueChromeAllowed.value)
  })
  const dialogueChromeVisible = computed(() => Boolean(dialogueChromePresence.value.dialogue))
  const dialogueChromePhase = computed(() => dialogueChromeVisible.value ? dialogueChromePresence.value.phase : undefined)
  const pipeline = engine.getPipeline()
  const emit = pipeline.emit.bind(pipeline)
  const closePanels = async () => {
    await engine.hideUI('menu')
    await engine.hideUI('saveLoad')
    await engine.hideUI('settings')
    await engine.hideUI('titleConfirm')
    await engine.hideUI('confirm')
    await engine.hideUI('gameOver')
    await emit(BacklogRenderToLogicEvents.CLOSE_REQUEST, {})
  }
  const stopAutoForHudInteraction = async () => {
    if (engine.getFlowControlState().mode === 'auto') {
      await engine.stopAuto()
    }
  }
  const openGameMenu = async () => {
    await stopAutoForHudInteraction()
    showStoryTree.value = false
    await closePanels()
    await engine.showUI('menu', {
      ...DEMO_OVERLAY_PLACEMENTS.gameMenu,
      title: '菜单',
      subtitle: `${hud.value.chapter === '00' ? '序章' : `第 ${hud.value.chapter} 章`} · ${hud.value.route}`,
      scene: createUiScene('game:menu', 'overlay', 'game-modal', {
        ...DEMO_OVERLAY_PLACEMENTS.gameMenu,
        defaultChrome: true,
        hideDialogue: false,
        hideHud: true,
      }),
      replaceOnOpen: true,
      ...DEMO_MENU_OPTIONS,
      showFlowControls: false,
      saveLoadSlotCount: SAVE_LOAD_SLOT_COUNT,
      saveLoadShowQuickActions: false,
      saveLoadOverlayStack: DEMO_OVERLAY_PLACEMENTS.saveLoad.overlayStack,
      saveLoadStackPriority: DEMO_OVERLAY_PLACEMENTS.saveLoad.stackPriority,
      saveLoadZIndex: DEMO_OVERLAY_PLACEMENTS.saveLoad.zIndex,
      settingsOverlayStack: DEMO_OVERLAY_PLACEMENTS.settings.overlayStack,
      settingsStackPriority: DEMO_OVERLAY_PLACEMENTS.settings.stackPriority,
      settingsZIndex: DEMO_OVERLAY_PLACEMENTS.settings.zIndex,
      titleActionLabel: 'TITLE',
      titleConfirmTitle: DEMO_TITLE_CONFIRM.title,
      titleConfirmSubtitle: DEMO_TITLE_CONFIRM.subtitle,
      titleConfirmDescription: DEMO_TITLE_CONFIRM.description,
      titleConfirmEvent: DEMO_TITLE_REQUEST_EVENT,
    })
  }
  const openBacklog = async () => {
    await stopAutoForHudInteraction()
    await closePanels()
    await emit(BacklogRenderToLogicEvents.OPEN_REQUEST, {
      ...DEMO_OVERLAY_PLACEMENTS.backlog,
      source: 'quick-menu',
      scene: createUiScene('game:backlog', 'overlay', 'game-modal', { ...DEMO_OVERLAY_PLACEMENTS.backlog, hideDialogue: true, defaultChrome: false }),
    })
  }
  const openMainMenuOverlay = async (elementId: string, config: Record<string, unknown> = {}) => {
    await closePanels()
    returnToMainMenuOverlay.value = elementId
    showStoryTree.value = false
    showMainMenu.value = false
    await engine.showUI(elementId, config)
  }
  const openMainMenuSettings = () => openMainMenuOverlay('settings', {
    ...DEMO_OVERLAY_PLACEMENTS.settings,
    title: '设置',
    source: 'main-menu',
    scene: createUiScene('system:settings', 'scene', 'main-menu', DEMO_OVERLAY_PLACEMENTS.settings),
  })
  const openMainMenuLoad = () => openMainMenuOverlay('saveLoad', {
    ...DEMO_OVERLAY_PLACEMENTS.saveLoad,
    mode: 'load',
    source: 'main-menu',
    slotCount: SAVE_LOAD_SLOT_COUNT,
    showQuickActions: false,
    scene: createUiScene('system:load', 'scene', 'main-menu', DEMO_OVERLAY_PLACEMENTS.saveLoad),
  })
  const returnToTitleMenu = async () => {
    returnToMainMenuOverlay.value = undefined
    await closePanels()
    await emit(DEMO_STORY_REQUEST, { action: 'pause' })
    showStoryTree.value = false
    galleryOpenedFromMainMenu.value = false
    showMainMenu.value = true
    toast.value = undefined
  }
  const openGameOverOverlay = async (payload: GameOverPayload) => {
    await closePanels()
    await engine.stopAuto()
    await engine.stopSkip()
    returnToMainMenuOverlay.value = undefined
    showStoryTree.value = false
    galleryOpenedFromMainMenu.value = false
    showMainMenu.value = false
    await engine.showUI('gameOver', {
      title: payload.title || 'GAME OVER',
      subtitle: payload.ending === 'handoff' ? '短结局' : payload.ending === 'letter' ? '普通结局' : '完整结局',
      description: payload.message || '故事已经结束。你可以回到标题菜单，或关闭这个面板停留在当前画面。',
      confirmLabel: '返回标题',
      cancelLabel: '留在此页',
      confirmEvent: DEMO_TITLE_REQUEST_EVENT,
      confirmPayload: { source: 'game-over', ending: payload.ending },
      closeOnConfirm: false,
      overlayStack: 'modal',
      scene: createUiScene('game:over', 'overlay', 'game-over'),
    })
  }
  const requestStory = async (request: StoryRequest) => {
    await closePanels()
    showMainMenu.value = false
    showStoryTree.value = false
    await emit(DEMO_STORY_REQUEST, request)
  }
  let galleryWasActive = Boolean(activeGallery.value?.sceneActive)
  const uiDisposers = [
    stopActiveUiSceneWatch,
    clearActiveUiSceneExitTimer,
    () => dialogueChromePresenceRuntime.destroy(),
    onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, (payload) => {
      activeView.value = payload.view
      const chapter = engine.getStoryPoint()?.chapterId
      if (chapter) updateHud({ chapter, route: STORY_TREE_NODES.find(node => node.chapter === chapter)?.title || '' })
      syncStoryTreeProjection()
      const nextGallery = payload.view.plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined
      const galleryIsActive = Boolean(nextGallery?.sceneActive)
      if (galleryWasActive && !galleryIsActive && galleryOpenedFromMainMenu.value) {
        galleryOpenedFromMainMenu.value = false
        showStoryTree.value = false
        showMainMenu.value = true
      }
      galleryWasActive = galleryIsActive
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.GAME_SAVE, (payload) => {
      if (payload.slotId?.startsWith('slot-')) showToast(`${slotLabel(payload.slotId)} 保存成功`, 'success')
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.GAME_LOAD, (payload) => {
      updateHud({ chapter: engine.getStoryPoint()?.chapterId || '00', route: STORY_TREE_NODES.find(node => node.chapter === engine.getStoryPoint()?.chapterId)?.title || '' })
      returnToMainMenuOverlay.value = undefined
      showMainMenu.value = false
      showStoryTree.value = false
      showToast(payload.slotId?.startsWith('slot-') ? `${slotLabel(payload.slotId)} 读取完成` : '已恢复阅读进度', 'success')
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.GAME_OVER, (payload) => {
      void openGameOverOverlay(payload).catch(error => console.error(error))
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.UI_HIDE, (payload) => {
      if (returnToMainMenuOverlay.value === payload.elementId) {
        returnToMainMenuOverlay.value = undefined
        showStoryTree.value = false
        showMainMenu.value = true
      }
    }),
  ]
  const titleRequestListener = () => {
    void returnToTitleMenu()
  }
  pipeline.on(DEMO_TITLE_REQUEST_EVENT, titleRequestListener)
  uiDisposers.push(() => pipeline.off(DEMO_TITLE_REQUEST_EVENT, titleRequestListener))
  const inputMenuListener = async (context: { event: { payload: unknown } }) => {
    const payload = context.event.payload as { command?: string; source?: string; pressed?: boolean }
    if (payload.pressed === false || !['ui:cancel', 'ui:menu'].includes(payload.command || '')) return
    if (showStoryTree.value) { showStoryTree.value = false; showMainMenu.value = true; return }
    if (showMainMenu.value) return
    if (activeBacklog.value?.visible) { await emit(BacklogRenderToLogicEvents.CLOSE_REQUEST, {}); return }
    const opened = ['confirm', 'titleConfirm', 'gameOver', 'saveLoad', 'settings', 'menu'].find(id => activeView.value.ui.overlays?.[id])
    if (opened) { await engine.hideUI(opened); return }
    if (payload.source === 'wheel:up') await openBacklog()
    else await openGameMenu()
  }
  pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, inputMenuListener)
  uiDisposers.push(() => pipeline.off(RenderToLogicEvents.USER_INPUT_COMMAND, inputMenuListener))


  const errorListener = (context: { event: { payload: unknown } }) => {
    showToast((context.event.payload as { message: string }).message, 'info')
    showMainMenu.value = true
  }
  pipeline.on(DEMO_STORY_ERROR, errorListener)
  uiDisposers.push(() => pipeline.off(DEMO_STORY_ERROR, errorListener))
  bootMessage.value = ''

  const DemoStageUi = defineComponent({
    name: 'DemoStageUi',
    setup() {
      return () => h(Fragment, [
        h('div', { class: 'vn-title-surface', 'aria-hidden': 'true', 'data-qua-input-ignore': '' }),
        h('nav', {
          class: 'vn-quick-menu',
          'aria-label': '阅读工具条',
          'aria-hidden': dialogueChromeVisible.value ? undefined : 'true',
          'data-dialogue-presence': dialogueChromePhase.value,
          'data-dialogue-visible': dialogueChromePhase.value === 'enter' ? 'true' : 'false',
          'data-qua-input-ignore': '',
        }, [
          ...DEMO_HUD_ACTIONS.map(item => h('button', {
            type: 'button', title: item.title, 'data-hud-action': item.id,
            'aria-pressed': item.action === 'toggle' ? activeView.value.flowControl.mode === item.id : undefined,
            class: activeView.value.flowControl.mode === item.id ? 'is-active' : undefined,
            onClick: () => item.id === 'auto' || item.id === 'skip'
              ? toggleDemoFlowControl(engine, item.id)
              : item.id === 'log' ? openBacklog() : openGameMenu(),
          }, item.label)),
        ]),
        showMainMenu.value
          ? h('section', { class: 'vn-main-menu', 'data-qua-input-ignore': '' }, [
              h('div', { class: 'vn-main-menu__inner' }, [
                h('h1', { class: 'vn-main-menu__title' }, GAME_TITLE),
                h('p', { class: 'vn-main-menu__english-title' }, GAME_ENGLISH_TITLE),
                h('nav', { class: 'vn-main-menu__actions', 'aria-label': '主菜单' }, [
                  h('button', { type: 'button', disabled: !library.value?.canContinue, onClick: () => requestStory({ action: 'continue' }) }, '继续阅读'),
                  h('button', { type: 'button', onClick: () => requestStory({ action: 'start' }) }, '从头开始'),
                  h('button', { type: 'button', onClick: openMainMenuLoad }, '读取存档'),
                  h('button', { type: 'button', onClick: () => { syncStoryTreeProjection(); showStoryTree.value = true; showMainMenu.value = false } }, '章节选择'),
                  h('button', { type: 'button', onClick: openMainMenuSettings }, '设置'),
                ]),
                h('p', { class: 'vn-main-menu__hint' }, '点击 / 空格推进 · 滚轮向上回看 · Esc 菜单'),
              ]),
            ])
          : null,
        showStoryTree.value
          ? h(QuaStoryTree, {
              className: 'vn-story-tree',
              nodes: storyTreeNodes.value,
              eyebrow: '',
              title: '章节选择',
              subtitle: `已开启 ${unlockedStoryTreeCount.value} / ${STORY_TREE_NODES.length} 章 · 选择章节，从章首重读`,
              closeLabel: '返回标题',
              selectable: true,
              onSelect: (node: { id: string }) => requestStory({ action: 'chapter', nodeId: node.id }),
              onClose: () => {
                showMainMenu.value = true
                showStoryTree.value = false
              },
            }, { node: renderDemoChapter })
          : null,
        toast.value
          ? h('p', {
              key: toast.value.id,
              class: ['vn-toast', `vn-toast--${toast.value.tone}`],
              'data-qua-input-ignore': '',
            }, toast.value.message)
          : null,
        h('p', { class: 'boot-message', 'data-qua-input-ignore': '' }, bootMessage.value),
      ])
    },
  })
  const demoStageUiPlugin: QuaVueRendererPlugin = {
    name: 'demo-stage-ui',
    setup() {},
    layers: [{
      id: 'demo-stage-ui',
      plane: 'stage',
      order: 10_000,
      component: DemoStageUi,
    }],
  }

  return defineComponent({
    name: 'QuaGameRoot',
    setup() {
      // System panels share the logical stage with dialogue and gallery on
      // every target; screen-plane CSS pixels bypass stage scaling.
      const rendererPlugins = [...createVisualNovelRendererPlugins({ input: { bindings: [{ source: 'wheel', direction: 'up', command: 'ui:menu', preventDefault: false, throttleMs: 250 }] } }).map(plugin => ({
        ...plugin,
        layers: plugin.layers?.map(layer => ({
          ...layer,
          ...(layer.plane === 'screen' ? { plane: 'overlay' as const } : {}),
          ...(layer.id === 'overlay' ? { component: DemoSystemPanels } : {}),
        })),
      })), demoStageUiPlugin]
      onBeforeUnmount(() => {
        for (const dispose of uiDisposers) {
          dispose()
        }
        if (toastTimer) {
          clearTimeout(toastTimer)
        }
      })
      return () => h('main', {
        class: 'game-root',
        'data-chapter': hud.value.chapter,
        'data-route': hud.value.route,
        'data-signal': hud.value.signal,
        'data-ui-scene-id': renderedActiveUiScene.value?.id,
        'data-ui-scene-hide-dialogue': renderedActiveUiScene.value?.overlay?.hideDialogue ? 'true' : undefined,
        'data-main-menu': showMainMenu.value ? 'true' : undefined,
        'data-system-overlay': systemOverlayMode.value,
        'data-title-surface': titleSurfaceActive.value ? 'true' : undefined,
        'data-hud-chrome': hudChromeVisible.value ? 'true' : 'false',
        'data-dialogue-chrome': dialogueChromeVisible.value ? 'true' : 'false',
      }, [
        h(QuaRenderer, {
          pipeline: engine.getPipeline(),
          assets,
          initialView: engine.getViewState(),
          plugins: rendererPlugins,
          runtimePluginLoader,
          saveSlots: engine.getStore(),
          className: 'vn-renderer',
        }, {
          backlog: () => h(QuaBacklogLayer, undefined, {
            default: ({ entries, close }: { entries: BacklogProjection['entries']; close: () => void | Promise<void> }) => h(DemoBacklogPanel, { entries, close }),
          }),
          settings: () => h(QuaSettingsLayer, undefined, {
            'form-header': renderDemoSettingsHeader,
            'form-actions': renderDemoSettingsActions,
            'scope-header': renderDemoSettingsScopeHeader,
            'field-control': renderDemoSettingsControl,
            'field-label': renderDemoSettingsLabel,
            'field-description': renderDemoSettingsDescription,
            'group-header': renderDemoSettingsGroupHeader,
          }),
        }),
      ])
    },
  })
}
