import { LogicToRenderEvents, onLogicToRender, type GameOverPayload } from '@quajs/engine'
import type { AudioPlayBgmOptions } from '@quajs/plugin-audio'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents, type BacklogProjection } from '@quajs/plugin-backlog'
import { GALLERY_PLUGIN_ID, type GalleryProjection } from '@quajs/plugin-gallery'
import { resolveActiveUiSceneProjection, uiSceneAllowsHudChrome, type ViewUiSceneProjection } from '@quajs/render-core'
import { QuaRenderer } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { QuaSettingsLayer } from '@quajs/renderer-vue/plugins/settings'
import { QuaStoryTree } from '@quajs/renderer-vue/plugins/ui'
import type { StoryChapterSelectProjection } from '@quajs/story-graph'
import { computed, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import menuRouteBackgroundUrl from '../../assets/images/ui/menu-route.jpg?url'
import {
  BGM,
  DEFAULT_BGM_OPTIONS,
  DEMO_TITLE_REQUEST_EVENT,
  GAME_ENGLISH_TITLE,
  GAME_TITLE,
  SAVE_LOAD_SLOT_COUNT,
} from './config'
import {
  DEMO_GALLERY_CATALOG_ID,
  DEMO_GALLERY_ENTRY_TITLES,
  type DemoGalleryEntryId,
} from './content/gallery'
import {
  INITIAL_STORY_TREE_NODE_ID,
  STORY_TREE_NODES,
} from './content/story-tree'
import { createDemoRuntime } from './runtime'
import { MainScene } from './story/main-scene'
import type { DemoHud, DemoToast, HudPatch } from './types'
import { createUiScene, DEMO_OVERLAY_PLACEMENTS, parseChapterIndex, slotLabel } from './ui/scene'
import {
  renderDemoSettingsActions,
  renderDemoSettingsControl,
  renderDemoSettingsHeader,
  renderDemoSettingsScopeHeader,
} from './ui/settings'
import { countUnlockedStoryTreeNodes, projectDemoStoryTreeNodes } from './ui/story-tree'

export async function createQuaGameApp() {
  const bootMessage = ref('Loading QuaEngine...')
  const showMainMenu = ref(true)
  const showStoryTree = ref(false)
  const returnToMainMenuOverlay = ref<string>()
  const toast = ref<DemoToast>()
  const currentChapterIndex = ref(-1)
  const storyChapterSelect = ref<StoryChapterSelectProjection>({ nodes: [] })
  const hud = ref<DemoHud>({
    chapter: 'BOOT',
    route: 'UNDECIDED',
    signal: '0',
  })
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let unlockStoryTreeChapter: (chapterIndex: number) => void = () => {}

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
      unlockStoryTreeChapter(chapterIndex)
    }
  }

  bootMessage.value = 'Preparing story runtime...'
  const { assets, audio, engine, gallery, runtimePluginLoader, storyGraph } = await createDemoRuntime()
  const syncStoryTreeProjection = () => {
    storyChapterSelect.value = storyGraph.getChapterSelectProjection()
  }
  unlockStoryTreeChapter = (chapterIndex: number) => {
    const node = STORY_TREE_NODES[chapterIndex]
    if (!node) {
      return
    }
    void storyGraph.unlockNode(node.id)
      .then(syncStoryTreeProjection)
      .catch(error => console.error(error))
  }
  await storyGraph.unlockNode(INITIAL_STORY_TREE_NODE_ID)
  syncStoryTreeProjection()
  const activeView = ref(engine.getViewState())
  const activeBacklog = computed(() => activeView.value.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined)
  const activeGallery = computed(() => activeView.value.plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined)
  const galleryOpenedFromMainMenu = ref(false)
  const activeUiScene = computed<ViewUiSceneProjection | undefined>(() => {
    return resolveActiveUiSceneProjection(activeView.value.ui.overlays)
      || (activeBacklog.value?.visible ? (activeBacklog.value.ui?.scene as ViewUiSceneProjection | undefined) : undefined)
  })
  const systemOverlayMode = computed<'main' | 'game' | undefined>(() => {
    if (activeGallery.value?.sceneActive) {
      return galleryOpenedFromMainMenu.value ? 'main' : 'game'
    }
    if (activeUiScene.value?.overlay?.variant === 'main-menu') {
      return 'main'
    }
    return activeUiScene.value ? 'game' : undefined
  })
  const titleSurfaceActive = computed(() =>
    showMainMenu.value
    || showStoryTree.value
    || systemOverlayMode.value === 'main'
    || galleryOpenedFromMainMenu.value
    || Boolean(returnToMainMenuOverlay.value),
  )
  const defaultChromeVisible = computed(() =>
    !titleSurfaceActive.value
    && !activeGallery.value?.sceneActive
    && uiSceneAllowsHudChrome(activeUiScene.value),
  )
  const pipeline = engine.getPipeline()
  const emit = pipeline.emit.bind(pipeline)
  let activeBgmAssetKey: string | undefined
  const playDemoBgm = async (assetKey: string, options: AudioPlayBgmOptions = {}) => {
    if (activeBgmAssetKey === assetKey) {
      return
    }
    activeBgmAssetKey = assetKey
    await audio.playBGM(assetKey, {
      ...DEFAULT_BGM_OPTIONS,
      ...options,
      id: 'demo-bgm',
    })
  }
  const playCurrentStoryBgm = async () => {
    const chapterIndex = parseChapterIndex(hud.value.chapter)
    if (chapterIndex >= 5) {
      await playDemoBgm(BGM.breach)
    }
    else if (chapterIndex === 4) {
      await playDemoBgm(BGM.oracle, { gainDb: -9 })
    }
    else if (chapterIndex >= 2) {
      await playDemoBgm(BGM.archive, { gainDb: -9 })
    }
    else if (chapterIndex === 1) {
      await playDemoBgm(BGM.trace)
    }
    else {
      await playDemoBgm(BGM.blackout)
    }
  }
  const closePanels = async () => {
    await engine.hideUI('menu')
    await engine.hideUI('saveLoad')
    await engine.hideUI('settings')
    await engine.hideUI('titleConfirm')
    await engine.hideUI('confirm')
    await engine.hideUI('gameOver')
    await emit(BacklogRenderToLogicEvents.CLOSE_REQUEST, {})
  }
  const unlockGallery = async (entryIdOrIds: DemoGalleryEntryId | readonly DemoGalleryEntryId[]) => {
    const entryIds = Array.isArray(entryIdOrIds) ? entryIdOrIds : [entryIdOrIds]
    const profile = gallery.getProfile()
    const lockedEntryIds = entryIds.filter(entryId => !profile.unlockedEntries[entryId])
    if (lockedEntryIds.length === 0) {
      return
    }

    await gallery.unlockEntries(lockedEntryIds, { source: 'story' })
    if (lockedEntryIds.length === 1) {
      const title = DEMO_GALLERY_ENTRY_TITLES.get(lockedEntryIds[0]!) || lockedEntryIds[0]
      showToast(`CG 已加入图库：${title}`, 'success')
    }
    else {
      showToast(`CG 图库更新：${lockedEntryIds.length} 项`, 'success')
    }
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
      title: 'MENU',
      subtitle: `${GAME_TITLE} / CH ${hud.value.chapter} / ${hud.value.route}`,
      scene: createUiScene('game:menu', 'overlay', 'game-modal', {
        ...DEMO_OVERLAY_PLACEMENTS.gameMenu,
        defaultChrome: true,
        hideDialogue: false,
        hideHud: true,
      }),
      replaceOnOpen: true,
      showBacklog: false,
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
      titleConfirmTitle: '回到标题菜单？',
      titleConfirmSubtitle: '当前进度不会自动保存',
      titleConfirmDescription: '回到标题菜单前建议先保存。继续返回后，故事运行状态会保留在后台，START 会回到当前进度。',
      titleConfirmEvent: DEMO_TITLE_REQUEST_EVENT,
    })
  }
  const openBacklog = async () => {
    await stopAutoForHudInteraction()
    await closePanels()
    await emit(BacklogRenderToLogicEvents.OPEN_REQUEST, {
      ...DEMO_OVERLAY_PLACEMENTS.backlog,
      source: 'quick-menu',
      scene: createUiScene('game:backlog', 'overlay', 'game-modal', DEMO_OVERLAY_PLACEMENTS.backlog),
    })
  }
  const openMainMenuOverlay = async (elementId: string, config: Record<string, unknown> = {}) => {
    await closePanels()
    returnToMainMenuOverlay.value = elementId
    showStoryTree.value = false
    showMainMenu.value = false
    await engine.showUI(elementId, config)
  }
  const openMainMenuGallery = async () => {
    await closePanels()
    galleryOpenedFromMainMenu.value = true
    showStoryTree.value = false
    showMainMenu.value = false
    await gallery.openScene({
      ...DEMO_OVERLAY_PLACEMENTS.gallery,
      catalogId: DEMO_GALLERY_CATALOG_ID,
      entryId: 'cg.title',
      reason: 'main-menu',
      filter: {
        unlockedOnly: false,
      },
    })
  }
  const openMainMenuSettings = () => openMainMenuOverlay('settings', {
    ...DEMO_OVERLAY_PLACEMENTS.settings,
    title: 'Config',
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
    await engine.stopAuto()
    await engine.stopSkip()
    showStoryTree.value = false
    galleryOpenedFromMainMenu.value = false
    showMainMenu.value = true
    await playDemoBgm(BGM.title, { gainDb: -10 })
    showToast('已回到标题菜单', 'info')
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
      subtitle: payload.ending ? `ENDING / ${payload.ending.toUpperCase()}` : undefined,
      description: payload.message || '故事已经结束。你可以回到标题菜单，或关闭这个面板停留在当前画面。',
      confirmLabel: 'TITLE',
      cancelLabel: 'CLOSE',
      confirmEvent: DEMO_TITLE_REQUEST_EVENT,
      confirmPayload: { source: 'game-over', ending: payload.ending },
      closeOnConfirm: false,
      overlayStack: 'modal',
      scene: createUiScene('game:over', 'overlay', 'game-over'),
    })
  }
  let storyLoadPromise: Promise<void> | undefined
  const startStory = () => {
    if (!storyLoadPromise) {
      bootMessage.value = 'Starting story...'
      storyLoadPromise = engine.loadScene(new MainScene(
        engine,
        updateHud,
        playDemoBgm,
        unlockGallery,
        () => {
          bootMessage.value = ''
        },
      )).catch((error: unknown) => {
        storyLoadPromise = undefined
        console.error(error)
        bootMessage.value = 'The demo failed to start. Check the browser console.'
      })
    }
    return storyLoadPromise
  }
  let galleryWasActive = Boolean(activeGallery.value?.sceneActive)
  const uiDisposers = [
    onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, (payload) => {
      activeView.value = payload.view
      syncStoryTreeProjection()
      const nextGallery = payload.view.plugins[GALLERY_PLUGIN_ID] as GalleryProjection | undefined
      const galleryIsActive = Boolean(nextGallery?.sceneActive)
      if (galleryWasActive && !galleryIsActive && galleryOpenedFromMainMenu.value) {
        galleryOpenedFromMainMenu.value = false
        showStoryTree.value = false
        showMainMenu.value = true
        void playDemoBgm(BGM.title, { gainDb: -10 }).catch(error => console.error(error))
      }
      galleryWasActive = galleryIsActive
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.GAME_SAVE, (payload) => {
      showToast(`${slotLabel(payload.slotId)} 保存成功`, 'success')
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.GAME_LOAD, (payload) => {
      returnToMainMenuOverlay.value = undefined
      showMainMenu.value = false
      showStoryTree.value = false
      void closePanels()
      showToast(`${slotLabel(payload.slotId)} 读取完成`, 'success')
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

  await playDemoBgm(BGM.title, { gainDb: -10 })
  bootMessage.value = ''

  return defineComponent({
    name: 'QuaGameRoot',
    setup() {
      const rendererPlugins = createVisualNovelRendererPlugins()
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
        style: {
          '--vn-menu-background': `url("${menuRouteBackgroundUrl}")`,
        },
        'data-chapter': hud.value.chapter,
        'data-route': hud.value.route,
        'data-signal': hud.value.signal,
        'data-ui-scene-id': activeUiScene.value?.id,
        'data-ui-scene-hide-dialogue': activeUiScene.value?.overlay?.hideDialogue ? 'true' : undefined,
        'data-main-menu': showMainMenu.value ? 'true' : undefined,
        'data-system-overlay': systemOverlayMode.value,
        'data-title-surface': titleSurfaceActive.value ? 'true' : undefined,
        'data-default-chrome': defaultChromeVisible.value ? 'true' : 'false',
      }, [
        h('div', { class: 'vn-title-surface', 'aria-hidden': 'true', 'data-qua-input-ignore': '' }),
        defaultChromeVisible.value
          ? h('div', { class: 'vn-title-plate', 'data-qua-input-ignore': '' }, [
              h('strong', { class: 'game-title' }, GAME_TITLE),
              h('span', { class: 'game-subtitle' }, 'TOKYO 2048'),
            ])
          : null,
        defaultChromeVisible.value
          ? h('nav', { class: 'vn-quick-menu', 'aria-label': 'quick menu', 'data-qua-input-ignore': '' }, [
              h('button', {
                type: 'button',
                title: activeView.value.flowControl.mode === 'auto' ? 'Stop auto mode' : 'Auto mode',
                class: activeView.value.flowControl.mode === 'auto' ? 'is-active' : undefined,
                onClick: async () => {
                  if (activeView.value.flowControl.mode === 'auto') {
                    await engine.stopAuto()
                  }
                  else {
                    await engine.startAuto()
                  }
                },
              }, 'AUTO'),
              h('button', {
                type: 'button',
                title: activeView.value.flowControl.mode === 'skip' ? 'Stop skip mode' : 'Skip read text',
                class: activeView.value.flowControl.mode === 'skip' ? 'is-active' : undefined,
                onClick: async () => {
                  await stopAutoForHudInteraction()
                  if (activeView.value.flowControl.mode === 'skip') {
                    await engine.stopSkip()
                  }
                  else {
                    await engine.startSkip()
                  }
                },
              }, 'SKIP'),
              h('button', {
                type: 'button',
                title: 'Backlog',
                onClick: openBacklog,
              }, 'LOG'),
              h('button', {
                type: 'button',
                title: 'Menu',
                onClick: openGameMenu,
              }, 'MENU'),
            ])
          : null,
        h(QuaRenderer, {
          pipeline: engine.getPipeline(),
          assets,
          initialView: engine.getViewState(),
          plugins: rendererPlugins,
          runtimePluginLoader,
          saveSlots: engine.getStore(),
          className: 'vn-renderer',
        }, {
          settings: () => h(QuaSettingsLayer, undefined, {
            'form-header': renderDemoSettingsHeader,
            'form-actions': renderDemoSettingsActions,
            'scope-header': renderDemoSettingsScopeHeader,
            'field-control': renderDemoSettingsControl,
          }),
        }),
        showMainMenu.value
          ? h('section', { class: 'vn-main-menu', 'data-qua-input-ignore': '' }, [
              h('div', { class: 'vn-main-menu__inner' }, [
                h('h1', { class: 'vn-main-menu__title' }, GAME_TITLE),
                h('p', { class: 'vn-main-menu__english-title' }, GAME_ENGLISH_TITLE),
                h('nav', { class: 'vn-main-menu__actions', 'aria-label': 'main menu' }, [
                  h('button', {
                    type: 'button',
                    onClick: () => {
                      showMainMenu.value = false
                      showStoryTree.value = false
                      void playCurrentStoryBgm()
                        .catch(error => console.error(error))
                        .then(startStory)
                    },
                  }, 'START'),
                  h('button', {
                    type: 'button',
                    onClick: openMainMenuLoad,
                  }, 'LOAD'),
                  h('button', {
                    type: 'button',
                    onClick: () => {
                      syncStoryTreeProjection()
                      showStoryTree.value = true
                      showMainMenu.value = false
                    },
                  }, 'STORY TREE'),
                  h('button', {
                    type: 'button',
                    onClick: openMainMenuGallery,
                  }, 'GALLERY'),
                  h('button', {
                    type: 'button',
                    onClick: openMainMenuSettings,
                  }, 'CONFIG'),
                ]),
              ]),
            ])
          : null,
        showStoryTree.value
          ? h(QuaStoryTree, {
              className: 'vn-story-tree',
              nodes: storyTreeNodes.value,
              eyebrow: 'ROUTE MAP',
              title: 'Story Tree',
              subtitle: `${unlockedStoryTreeCount.value} / ${STORY_TREE_NODES.length} nodes unlocked`,
              closeLabel: 'CLOSE',
              onClose: () => {
                showMainMenu.value = true
                showStoryTree.value = false
              },
            })
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
}
