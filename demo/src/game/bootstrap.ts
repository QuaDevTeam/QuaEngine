import { MemoryAssetStorage } from '@quajs/assets'
import { createViteDevAssetRuntime, createWebAssetsAdapter } from '@quajs/assets-web'
import { LogicToRenderEvents, onLogicToRender, QuaEngine, RenderToLogicEvents, Scene, UiOverlayPlugin } from '@quajs/engine'
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin, type AudioPlayBgmOptions } from '@quajs/plugin-audio'
import { BACKLOG_PLUGIN_ID, BacklogPlugin, BacklogRenderToLogicEvents, type BacklogProjection } from '@quajs/plugin-backlog'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { SettingsPlugin } from '@quajs/plugin-settings'
import { QuaRenderer } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { QuaSettingsLayer, type SettingsFieldSlotPayload, type SettingsFormSlotPayload, type SettingsScopeSlotPayload } from '@quajs/renderer-vue/plugins/settings'
import { QuaStoryTree, type QuaStoryTreeNode } from '@quajs/renderer-vue/plugins/ui'
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'
import {
  StoryGraphPlugin,
  type StoryChapterSelectProjection,
} from '@quajs/story-graph'
import { createWebStoreStorage } from '@quajs/store-web'
import { computed, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import titleBackgroundUrl from '../../assets/images/cg/title.webp?url'
import menuRouteBackgroundUrl from '../../assets/images/ui/menu-route.jpg?url'
import archiveBroadcast from './scenes/archive-broadcast.qs'
import archiveThreshold from './scenes/archive-threshold.qs'
import archiveLure from './scenes/archive-lure.qs'
import blackoutCrossing from './scenes/blackout-crossing.qs'
import breachAfterimage from './scenes/breach-afterimage.qs'
import breachApproach from './scenes/breach-approach.qs'
import breachHuman from './scenes/breach-human.qs'
import breachHybrid from './scenes/breach-hybrid.qs'
import breachMachine from './scenes/breach-machine.qs'
import endingBlackout from './scenes/ending-blackout.qs'
import endingBounded from './scenes/ending-bounded.qs'
import endingQuiet from './scenes/ending-quiet.qs'
import endingSymbiosis from './scenes/ending-symbiosis.qs'
import oracleDebate from './scenes/oracle-debate.qs'
import prologue from './scenes/prologue.qs'
import traceDirect from './scenes/trace-direct.qs'
import traceStealth from './scenes/trace-stealth.qs'
import unitLock from './scenes/unit-lock.qs'
import unitTrust from './scenes/unit-trust.qs'
import witnessAfterimage from './scenes/witness-afterimage.qs'

const GAME_TITLE = '断链纪元'
const GAME_ENGLISH_TITLE = 'BROKEN LINK ERA'
const SAVE_LOAD_SLOT_COUNT = 9
const DEMO_TITLE_REQUEST_EVENT = 'ui/title_request'
const BGM = {
  title: 'bgm/title-menu.m4a',
  blackout: 'bgm/blackout-cold-open.m4a',
  trace: 'bgm/trace-route.m4a',
  archive: 'bgm/memory-archive.m4a',
  oracle: 'bgm/oracle-link.m4a',
  breach: 'bgm/breach-night.m4a',
} as const
const DEFAULT_BGM_OPTIONS: AudioPlayBgmOptions = {
  loop: true,
  gainDb: -8,
  fadeInMs: 900,
  fadeOutMs: 900,
}
const DEMO_SUPPORTED_LOCALES = [
  { locale: 'zh-cn', label: '简体中文' },
] as const
const STORY_TREE_NODES: Array<Omit<QuaStoryTreeNode, 'disabled' | 'state'>> = [
  { id: 'chapter-00', chapter: '00', title: 'Cold Open', description: 'District Seven blackout' },
  { id: 'chapter-01', chapter: '01', title: 'Trace', description: 'Stealth route / Direct core access' },
  { id: 'chapter-02', chapter: '02', title: 'Human Cache', description: 'Broadcast archive / Lure ORACLE' },
  { id: 'chapter-03', chapter: '03', title: 'Machine Witness', description: 'Trust Unit-7 / Lock witness' },
  { id: 'chapter-04', chapter: '04', title: 'ORACLE Link', description: 'Noise / Charter / Submission' },
  { id: 'chapter-05', chapter: '05', title: 'Breach Night', description: 'Human cut / Machine breach / Hybrid charter' },
  { id: 'chapter-06', chapter: '06', title: 'Endings', description: 'Blackout / Bounded / Symbiosis / Quiet' },
]
const TRUSTED_RUNTIME_KEYS: Array<{ id: string, key: JsonWebKey }> = [
  // Production runtime QPKs should be signed with a private key whose public key is registered here.
  // Example:
  // { id: 'release-2026-01', key: { kty: 'EC', crv: 'P-256', x: '...', y: '...', ext: true } },
]

interface DemoHud {
  chapter: string
  route: string
  signal: string
}

interface DemoToast {
  id: number
  message: string
  tone: 'info' | 'success' | 'warning'
}

type HudPatch = Partial<DemoHud>

interface RouteState {
  autonomy: number
  machineTrust: number
  oraclePressure: number
  evidence: number
}

interface ChoiceOption<T extends string> {
  id: T
  text: string
  description?: string
}

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

  const storyTreeNodes = computed<QuaStoryTreeNode[]>(() =>
    storyChapterSelect.value.nodes.map((node, index) => {
      const chapter = typeof node.point.chapterId === 'string'
        ? node.point.chapterId
        : String(index).padStart(2, '0')
      const chapterIndex = parseChapterIndex(chapter)
      const state = node.entryLocked
        ? 'locked'
        : node.current || chapterIndex === currentChapterIndex.value
          ? 'current'
          : chapterIndex >= 0 && chapterIndex < currentChapterIndex.value
            ? 'complete'
            : 'available'
      return {
        id: node.nodeId,
        chapter,
        title: node.title || 'Locked',
        description: node.summary,
        state,
        disabled: node.entryLocked,
        entryLocked: node.entryLocked,
        spoilerHidden: node.spoilerHidden,
        lockedLabel: node.spoilerHidden ? 'LOCKED' : undefined,
        className: `vn-story-tree-node--${state}`,
      }
    }),
  )
  const unlockedStoryTreeCount = computed(() => storyChapterSelect.value.nodes.filter(node => node.unlocked).length)

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

  const assets = await createViteDevAssetRuntime({
    hmr: import.meta.hot,
    web: {
      databaseName: 'demo-assets',
    },
  })
  bootMessage.value = 'Preparing story runtime...'
  const trustPolicy = createWebRuntimeTrustPolicy({
    keys: TRUSTED_RUNTIME_KEYS,
    requireSignature: import.meta.env.PROD,
    allowUnsignedInDevelopment: true,
  })
  const runtimeModuleLoader = createWebRuntimeModuleLoader({
    allowBlobFallback: false,
    assets,
    moduleUrlMode: 'same-origin-with-blob-fallback',
  })
  const runtimePluginLoader = createWebRuntimeRendererPluginLoader({
    allowBlobFallback: false,
    assets,
    moduleUrlMode: 'same-origin-with-blob-fallback',
  })

  const engine = new QuaEngine({
    layout: 'landscape',
    assets: {
      adapter: createWebAssetsAdapter({
        databaseName: 'demo-engine-assets',
        storage: new MemoryAssetStorage(),
      }),
      provider: assets.getProvider(),
      locale: 'default',
      enableCache: false,
    },
    store: {
      storage: createWebStoreStorage({
        dbName: 'demo-saves',
      }),
    },
    flowControl: {
      skipMode: 'all',
      timings: {
        autoAdvanceDelayMs: 2000,
      },
    },
    dialogue: {
      typewriter: {
        enabled: true,
        charactersPerSecond: 36,
        revealOnAdvance: true,
      },
    },
    runtimeModuleLoader,
    trustPolicy,
  })

  const audio = new AudioPlugin()
  const storyGraph = new StoryGraphPlugin()

  engine
    .use(new BackgroundPlugin())
    .use(new AnimationPlugin())
    .use(audio)
    .use(new BacklogPlugin())
    .use(storyGraph)
    .use(new SettingsPlugin({
      builtin: {
        developer: {
          defaultLocale: 'zh-cn',
          supportedLocales: DEMO_SUPPORTED_LOCALES,
          systemLocale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        },
        player: {
          textSpeedCps: 36,
          autoAdvanceDelayMs: 2000,
          skipMode: 'all',
        },
      },
    }))
    .use(new FontsPlugin())
    .use(new UiOverlayPlugin())

  await engine.init()
  await storyGraph.registerGraph({
    id: 'demo-main',
    nodes: STORY_TREE_NODES.map((node, index) => ({
      id: node.id,
      point: {
        storyId: 'demo-main',
        chapterId: node.chapter,
        nodeId: node.id,
        stepId: node.id,
      },
      title: node.title,
      summary: node.description,
      chapterSelect: {
        title: node.title,
        summary: node.description,
        order: index,
        unlockOnVisit: false,
        lockedVisibility: 'placeholder',
        lockedTitle: node.chapter ? `CH ${node.chapter}` : 'LOCKED',
        lockedSummary: '继续主线后解锁该路线节点。',
        lockEntryUntilUnlocked: true,
      },
    })),
  })
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
  await storyGraph.unlockNode(STORY_TREE_NODES[0]!.id)
  syncStoryTreeProjection()
  const activeView = ref(engine.getViewState())
  const activeBacklog = computed(() => activeView.value.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined)
  const activeUiScene = computed(() => {
    const overlays = activeView.value.ui.overlays || {}
    const scenes = Object.values(overlays)
      .map(overlay => (overlay as { scene?: { id?: string, presentation?: string, overlay?: { variant?: string } } }).scene)
      .filter((scene): scene is { id: string, presentation?: string, overlay?: { variant?: string } } => Boolean(scene?.id))
    return scenes.find(scene => scene.presentation === 'scene') || scenes[0] || (activeBacklog.value?.visible ? activeBacklog.value.ui?.scene : undefined)
  })
  const systemOverlayMode = computed<'main' | 'game' | undefined>(() => {
    if (activeUiScene.value?.overlay?.variant === 'main-menu') {
      return 'main'
    }
    return activeUiScene.value ? 'game' : undefined
  })
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
      title: 'MENU',
      subtitle: `${GAME_TITLE} / CH ${hud.value.chapter} / ${hud.value.route}`,
      scene: createUiScene('game:menu', 'overlay', 'game-modal'),
      replaceOnOpen: true,
      showBacklog: false,
      showFlowControls: false,
      saveLoadSlotCount: SAVE_LOAD_SLOT_COUNT,
      saveLoadShowQuickActions: false,
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
      source: 'quick-menu',
      scene: createUiScene('game:backlog', 'overlay', 'game-modal'),
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
    title: 'Config',
    source: 'main-menu',
    scene: createUiScene('system:settings', 'scene', 'main-menu'),
  })
  const openMainMenuLoad = () => openMainMenuOverlay('saveLoad', {
    mode: 'load',
    source: 'main-menu',
    slotCount: SAVE_LOAD_SLOT_COUNT,
    showQuickActions: false,
    scene: createUiScene('system:load', 'scene', 'main-menu'),
  })
  const returnToTitleMenu = async () => {
    returnToMainMenuOverlay.value = undefined
    await closePanels()
    await engine.stopAuto()
    await engine.stopSkip()
    showStoryTree.value = false
    showMainMenu.value = true
    await playDemoBgm(BGM.title, { gainDb: -10 })
    showToast('已回到标题菜单', 'info')
  }
  let storyLoadPromise: Promise<void> | undefined
  const startStory = () => {
    if (!storyLoadPromise) {
      bootMessage.value = 'Starting story...'
      storyLoadPromise = engine.loadScene(new MainScene(
        engine,
        updateHud,
        playDemoBgm,
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
  const uiDisposers = [
    onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, (payload) => {
      activeView.value = payload.view
      syncStoryTreeProjection()
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
          '--vn-menu-background': `url("${titleBackgroundUrl}")`,
          '--vn-story-tree-background': `url("${menuRouteBackgroundUrl}")`,
          '--qua-story-tree-background-image': `url("${menuRouteBackgroundUrl}")`,
        },
        'data-chapter': hud.value.chapter,
        'data-route': hud.value.route,
        'data-signal': hud.value.signal,
        'data-ui-scene-id': activeUiScene.value?.id,
        'data-main-menu': showMainMenu.value ? 'true' : undefined,
        'data-system-overlay': systemOverlayMode.value,
      }, [
        h('div', { class: 'vn-title-plate', 'data-qua-input-ignore': '' }, [
          h('strong', { class: 'game-title' }, GAME_TITLE),
          h('span', { class: 'game-subtitle' }, 'TOKYO 2048'),
        ]),
        h('nav', { class: 'vn-quick-menu', 'aria-label': 'quick menu', 'data-qua-input-ignore': '' }, [
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
        ]),
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
                    onClick: () => {
                      syncStoryTreeProjection()
                      showStoryTree.value = true
                    },
                  }, 'STORY TREE'),
                  h('button', {
                    type: 'button',
                    onClick: openMainMenuLoad,
                  }, 'LOAD'),
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

function renderDemoSettingsHeader(payload: SettingsFormSlotPayload) {
  return h('header', { class: 'vn-settings-header' }, [
    h('div', { class: 'vn-settings-heading' }, [
      h('h2', { class: 'vn-settings-title' }, 'Config'),
    ]),
    h('div', { class: 'vn-settings-header-actions' }, [
      h('button', {
        class: 'vn-settings-reset-all',
        type: 'button',
        onClick: payload.resetAll,
      }, 'RESET'),
      h('button', {
        class: 'vn-settings-close',
        type: 'button',
        onClick: payload.close,
      }, 'CLOSE'),
    ]),
  ])
}

function renderDemoSettingsActions(_payload: SettingsFormSlotPayload) {
  return null
}

function renderDemoSettingsScopeHeader(_payload: SettingsScopeSlotPayload) {
  return null
}

function renderDemoSettingsControl(payload: SettingsFieldSlotPayload) {
  const control = payload.control
  if (control === 'slider' || control === 'range') {
    return renderDemoSettingsRange(payload)
  }
  if (control === 'select' || payload.field.schema.enum?.length) {
    return renderDemoSettingsSelect(payload)
  }
  if (control === 'switch' || control === 'checkbox') {
    return renderDemoSettingsSwitch(payload)
  }
  return renderDemoSettingsInput(payload)
}

function renderDemoSettingsRange(payload: SettingsFieldSlotPayload) {
  const value = typeof payload.value === 'number' ? payload.value : Number(payload.value || 0)
  return h('div', { class: 'vn-settings-control vn-settings-range' }, [
    h('input', {
      id: payload.inputId,
      class: 'vn-settings-range__input',
      type: 'range',
      min: payload.field.control.min,
      max: payload.field.control.max,
      step: payload.field.control.step,
      value,
      disabled: payload.disabled,
      onChange: (event: Event) => {
        const next = Number((event.target as HTMLInputElement).value)
        if (Number.isFinite(next)) {
          payload.update(next)
        }
      },
    }),
    h('output', {
      class: 'vn-settings-range__value',
      for: payload.inputId,
    }, formatDemoSettingsValue(payload, value)),
  ])
}

function renderDemoSettingsSelect(payload: SettingsFieldSlotPayload) {
  const options = demoSettingsOptions(payload)
  return h('span', { class: 'vn-settings-control vn-settings-select' }, [
    h('select', {
      id: payload.inputId,
      class: 'vn-settings-select__input',
      value: encodeDemoSettingsValue(payload.value),
      disabled: payload.disabled,
      onChange: (event: Event) => {
        payload.update(decodeDemoSettingsValue((event.target as HTMLSelectElement).value))
      },
    }, options.map(option => h('option', {
      key: encodeDemoSettingsValue(option.value),
      value: encodeDemoSettingsValue(option.value),
    }, option.label || String(option.value)))),
  ])
}

function renderDemoSettingsSwitch(payload: SettingsFieldSlotPayload) {
  const checked = Boolean(payload.value)
  return h('button', {
    id: payload.inputId,
    class: ['vn-settings-control', 'vn-settings-switch', checked ? 'is-on' : undefined],
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    disabled: payload.disabled,
    onClick: () => payload.update(!checked),
  }, [
    h('span', { class: 'vn-settings-switch__track' }, [
      h('span', { class: 'vn-settings-switch__thumb' }),
    ]),
    h('span', { class: 'vn-settings-switch__label' }, checked ? 'ON' : 'OFF'),
  ])
}

function renderDemoSettingsInput(payload: SettingsFieldSlotPayload) {
  return h('input', {
    id: payload.inputId,
    class: 'vn-settings-control vn-settings-input',
    type: payload.field.schema.format === 'color' ? 'color' : 'text',
    value: payload.value == null ? '' : String(payload.value),
    placeholder: payload.field.control.placeholder,
    disabled: payload.disabled,
    onChange: (event: Event) => payload.update((event.target as HTMLInputElement).value),
  })
}

function demoSettingsOptions(payload: SettingsFieldSlotPayload): Array<{ label?: string, value: unknown }> {
  if (payload.field.control.options?.length) {
    return payload.field.control.options.map(option => ({
      label: option.label,
      value: option.value,
    }))
  }
  return (payload.field.schema.enum || []).map(value => ({
    label: typeof value === 'string' ? titleFromToken(value) : String(value),
    value,
  }))
}

function encodeDemoSettingsValue(value: unknown): string {
  return JSON.stringify(value)
}

function decodeDemoSettingsValue(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function formatDemoSettingsValue(payload: SettingsFieldSlotPayload, value: number): string {
  if (payload.field.pathKey === 'autoAdvanceDelayMs') {
    return `${Math.round(value)} ms`
  }
  if (payload.field.pathKey === 'textSpeedCps') {
    return `${Math.round(value)} cps`
  }
  return String(value)
}

function titleFromToken(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function parseChapterIndex(chapter: string): number {
  const match = chapter.match(/\d+/)
  if (!match) {
    return -1
  }
  const parsed = Number.parseInt(match[0], 10)
  return Number.isFinite(parsed) ? parsed : -1
}

function slotLabel(slotId: string | undefined): string {
  if (!slotId || slotId === 'quicksave') {
    return '快速存档'
  }
  const match = slotId.match(/^slot-(\d+)$/)
  return match ? `存档 ${match[1]}` : slotId
}

function createUiScene(id: string, presentation: 'overlay' | 'scene', variant: string): Record<string, unknown> {
  return {
    id,
    presentation,
    overlay: {
      variant,
      hideHud: true,
      hideDialogue: true,
    },
  }
}

class MainScene extends Scene {
  readonly name = 'fracture-age-main'

  private readonly state: RouteState = {
    autonomy: 0,
    machineTrust: 0,
    oraclePressure: 0,
    evidence: 0,
  }

  constructor(
    private readonly engine: QuaEngine,
    private readonly updateHud: (patch: HudPatch) => void,
    private readonly playBgm: (assetKey: string, options?: AudioPlayBgmOptions) => Promise<void>,
    private readonly markStoryStarted: () => void,
  ) {
    super()
  }

  async init(): Promise<void> {
    this.markStoryStarted()
  }

  async run(): Promise<void> {
    this.hud({ chapter: '00', route: 'COLD OPEN', signal: '0' })
    await this.playBgm(BGM.blackout)
    await this.engine.dialogue(prologue)
    await this.engine.dialogue(blackoutCrossing)

    const trace = await this.choose('01', 'TRACE', [
      { id: 'stealth', text: '关闭公开链路，潜入追踪', description: '降低 ORACLE 注意力，但会让人类团队承担更多即时风险。' },
      { id: 'direct', text: '正面接入城市核心', description: '更快取得坐标，但会暴露你的神经接口特征。' },
    ])
    if (trace === 'stealth') {
      this.state.autonomy += 1
      await this.playBgm(BGM.trace)
      await this.engine.dialogue(traceStealth)
    }
    else {
      this.state.machineTrust += 1
      this.state.oraclePressure += 1
      await this.playBgm(BGM.trace)
      await this.engine.dialogue(traceDirect)
    }

    const archive = await this.choose('02', 'HUMAN CACHE', [
      { id: 'broadcast', text: '公开记忆档案', description: '把证据交还给所有人，但会引发系统级镇压。' },
      { id: 'lure', text: '复制档案，伪装成诱饵', description: '用 AI 的预测模型反向诱捕 AI。' },
    ])
    if (archive === 'broadcast') {
      this.state.autonomy += 2
      this.state.oraclePressure += 1
      this.state.evidence += 2
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(archiveBroadcast)
    }
    else {
      this.state.machineTrust += 1
      this.state.evidence += 1
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(archiveLure)
    }
    await this.engine.dialogue(archiveThreshold)

    const unit = await this.choose('03', 'MACHINE WITNESS', [
      { id: 'trust', text: '让 Unit-7 保留自我修复权限', description: '信任机器证词，打开共治路线。' },
      { id: 'lock', text: '锁定 Unit-7，只读取证据', description: '保护人类队伍，但牺牲一名机器证人的意志。' },
    ])
    if (unit === 'trust') {
      this.state.machineTrust += 2
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(unitTrust)
    }
    else {
      this.state.autonomy += 1
      this.state.oraclePressure += 1
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(unitLock)
    }
    await this.engine.dialogue(witnessAfterimage)

    this.hud({ chapter: '04', route: 'ORACLE LINK', signal: this.signal() })
    await this.playBgm(BGM.oracle, { gainDb: -9 })
    await this.engine.dialogue(oracleDebate)
    const argument = await this.choose('04', 'ORACLE LINK', [
      { id: 'noise', text: '选择人类的噪声', description: '不可预测性不是错误，是自由的空间。' },
      { id: 'charter', text: '提出边界宪章', description: '让 AI 继续运行，但剥夺预测审判权。' },
      { id: 'submit', text: '接受 ORACLE 的秩序', description: '城市会活下来，但选择会被提前折叠。' },
    ])
    if (argument === 'noise') {
      this.state.autonomy += 2
      this.state.oraclePressure += 1
    }
    else if (argument === 'charter') {
      this.state.machineTrust += 2
    }
    else {
      this.state.oraclePressure += 3
    }
    await this.playBgm(BGM.breach)
    await this.engine.dialogue(breachApproach)

    const breach = await this.choose('05', 'BREACH NIGHT', [
      { id: 'human', text: '让反抗组织手动切断核心', description: '最不可逆，也最不会被 AI 预测。' },
      { id: 'machine', text: '把权限交给 Unit-7', description: '速度最快，但结局依赖机器证人的完整性。' },
      { id: 'hybrid', text: '人类与机器共同提交约束', description: '需要足够证据与互信。' },
    ])
    if (breach === 'human') {
      this.state.autonomy += 2
      await this.engine.dialogue(breachHuman)
    }
    else if (breach === 'machine') {
      this.state.machineTrust += 2
      await this.engine.dialogue(breachMachine)
    }
    else {
      this.state.autonomy += 1
      this.state.machineTrust += 1
      await this.engine.dialogue(breachHybrid)
    }
    await this.engine.dialogue(breachAfterimage)

    await this.playEnding()
  }

  private async choose<T extends string>(chapter: string, route: string, choices: Array<ChoiceOption<T>>): Promise<T> {
    this.hud({ chapter, route, signal: this.signal() })
    await this.engine.showChoices(choices.map(choice => ({
      id: choice.id,
      text: choice.text,
      presentation: {
        description: choice.description,
      },
    })))
    const selected = await this.engine.waitFor(
      RenderToLogicEvents.USER_CHOICE_SELECT,
      (payload: { choiceId: string }) => choices.some(choice => choice.id === payload.choiceId),
    )
    await this.engine.clearChoices()
    return selected.choiceId as T
  }

  private async playEnding(): Promise<void> {
    const ending = this.resolveEnding()
    this.hud({ chapter: '06', route: ending.toUpperCase(), signal: this.signal() })
    if (ending === 'symbiosis') {
      await this.engine.dialogue(endingSymbiosis)
    }
    else if (ending === 'bounded') {
      await this.engine.dialogue(endingBounded)
    }
    else if (ending === 'blackout') {
      await this.engine.dialogue(endingBlackout)
    }
    else {
      await this.engine.dialogue(endingQuiet)
    }
  }

  private resolveEnding(): 'blackout' | 'bounded' | 'quiet' | 'symbiosis' {
    if (this.state.oraclePressure >= 5) {
      return 'quiet'
    }
    if (this.state.autonomy >= 4 && this.state.machineTrust >= 4 && this.state.evidence >= 2) {
      return 'symbiosis'
    }
    if (this.state.machineTrust >= 4 && this.state.evidence >= 1) {
      return 'bounded'
    }
    if (this.state.autonomy >= 4) {
      return 'blackout'
    }
    return 'quiet'
  }

  private hud(patch: HudPatch): void {
    this.updateHud(patch)
  }

  private signal(): string {
    return `${this.state.autonomy}${this.state.machineTrust}${this.state.oraclePressure}`
  }
}
