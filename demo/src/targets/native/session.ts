import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import {
  LogicToRenderEvents,
  onLogicToRender,
  QuaEngine,
  RenderToLogicEvents,
  type GameOverPayload,
} from '@quajs/engine'
import {
  createNativeRendererViewProjection,
  emitNativeRendererIntentToPipeline,
  installNativeQuickJsPipelineBridge,
  type NativeQuickJsPipelineBridge,
  type NativeRendererEngineViewProjection,
} from '@quajs/engine-native'
import { parseNativeRendererIntentPayload, type NativeRendererIntent } from '@quajs/native-contracts'
import type { AudioPlayBgmOptions } from '@quajs/plugin-audio'
import { BGM, DEFAULT_BGM_OPTIONS, GAME_ENGLISH_TITLE, GAME_TITLE, SAVE_LOAD_SLOT_COUNT } from '../../game/config'
import { DEMO_GALLERY_CATALOG_ID, type DemoGalleryEntryId } from '../../game/content/gallery'
import { INITIAL_STORY_TREE_NODE_ID, STORY_TREE_NODES } from '../../game/content/story-tree'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import { MainScene } from '../../game/story/main-scene'
import type { HudPatch } from '../../game/types'
import { createUiScene, DEMO_OVERLAY_PLACEMENTS, parseChapterIndex } from '../../game/ui/scene'
import { DEMO_NATIVE_FEATURE_SURFACES } from './features'
import {
  createNativeDemoAppSurface,
  NATIVE_DEMO_APP_ELEMENT_ID,
  type NativeDemoAppScreen,
  type NativeDemoAppSurfaceState,
} from './ui'

export interface DemoNativeSession {
  connectPipelineBridge: (bridge: NativeQuickJsPipelineBridge) => () => void
  destroy: () => Promise<void>
  dispatchIntent: (intent: NativeRendererIntent) => Promise<void>
  getInteractionDiagnostics: () => Record<string, unknown>
}

interface InteractionDiagnostics {
  intentCount: number
  lastIntentType: string | null
  lastAction: string | null
  phases: string[]
  error: string | null
}

type FeaturePanel = 'backlog' | 'gallery' | 'settings'
type SaveLoadMode = 'load' | 'save'

export async function createDemoNativeSession(): Promise<DemoNativeSession> {
  QuaEngine.resetInstance()
  const runtime = await createDemoEngineRuntime({
    engine: {
      project: {
        name: 'Broken Link Era Demo',
        bundleId: 'dev.quajs.demo.brokenlinkera',
        version: '0.1.0',
      },
      layout: 'landscape',
      assets: { adapter: createMemoryAssetsAdapter(), locale: 'default', enableCache: false },
      flowControl: { skipMode: 'all' },
      dialogue: {
        typewriter: { enabled: true, durationMs: 1600, revealOnAdvance: true },
      },
    },
    systemLocale: 'zh-cn',
  })
  configureCharacterRuntime({ engine: runtime.engine, waitForAdvance: true })

  const diagnostics: InteractionDiagnostics = {
    intentCount: 0,
    lastIntentType: null,
    lastAction: null,
    phases: [],
    error: null,
  }
  const phase = (value: string) => {
    diagnostics.phases.push(value)
    if (diagnostics.phases.length > 64) {
      diagnostics.phases.shift()
    }
  }
  const recordError = (error: unknown, context: string) => {
    diagnostics.error = error instanceof Error ? error.message : String(error)
    phase(`${context}:error`)
    // Forward to the native log facade so intent-handler failures are visible
    // on stderr instead of only in the E2E diagnostics snapshot.
    console.error(`[native-demo] ${context} failed: ${diagnostics.error}`)
  }

  let destroyed = false
  let currentChapterIndex = -1
  let currentChapter = 'BOOT'
  let currentRoute = 'UNDECIDED'
  let activeBgmAssetKey: string | undefined
  let storyLoadPromise: Promise<void> | undefined
  let systemReturnScreen: NativeDemoAppScreen = 'title'
  let systemReturnTitleSurface = true
  let saveLoadMode: SaveLoadMode = 'load'
  let saveLoadReturnScreen: NativeDemoAppScreen = 'title'
  let saveLoadReturnTitleSurface = true

  let appState: NativeDemoAppSurfaceState = {
    t: nativeDemoUiString,
    autoActive: false,
    englishTitle: GAME_ENGLISH_TITLE,
    gameOverDescription: '故事已经结束。你可以回到标题菜单，或关闭面板停留在当前画面。',
    gameOverSubtitle: 'ENDING',
    gameOverTitle: 'GAME OVER',
    gameMenuSubtitle: `${GAME_TITLE} / CH BOOT / UNDECIDED`,
    saveLoadMode,
    saveLoadTitle: 'LOAD',
    saveSlotItems: createEmptySaveSlotItems(),
    screen: 'title',
    skipActive: false,
    storyTreeItems: createStoryTreeItems(),
    title: GAME_TITLE,
    titleSurface: true,
    galleryItems: [],
    backlogItems: [],
    settingItems: createDefaultSettingItems(),
  }

  const refreshAppSurface = async (patch: Partial<NativeDemoAppSurfaceState> = {}) => {
    if (destroyed) {
      return
    }
    const flowMode = runtime.engine.getFlowControlState().mode
    appState = {
      ...appState,
      ...patch,
      autoActive: flowMode === 'auto',
      skipActive: flowMode === 'skip',
    }
    await runtime.engine.showUI(NATIVE_DEMO_APP_ELEMENT_ID, createNativeDemoAppSurface(appState))
  }

  const playDemoBgm = async (assetKey: string, options: AudioPlayBgmOptions = {}) => {
    if (activeBgmAssetKey === assetKey) {
      return
    }
    activeBgmAssetKey = assetKey
    await runtime.audio.playBGM(assetKey, {
      ...DEFAULT_BGM_OPTIONS,
      ...options,
      id: 'demo-native-bgm',
    })
  }

  const playCurrentStoryBgm = async () => {
    if (currentChapterIndex >= 5) {
      await playDemoBgm(BGM.breach)
    }
    else if (currentChapterIndex === 4) {
      await playDemoBgm(BGM.oracle, { gainDb: -9 })
    }
    else if (currentChapterIndex >= 2) {
      await playDemoBgm(BGM.archive, { gainDb: -9 })
    }
    else if (currentChapterIndex === 1) {
      await playDemoBgm(BGM.trace)
    }
    else {
      await playDemoBgm(BGM.blackout)
    }
  }

  const refreshStoryTree = async () => {
    appState.storyTreeItems = runtime.storyGraph.getChapterSelectProjection().nodes.map((node, index) => {
      const chapter = typeof node.point.chapterId === 'string'
        ? node.point.chapterId
        : String(index).padStart(2, '0')
      const state = node.entryLocked
        ? 'LOCKED'
        : node.current || parseChapterIndex(chapter) === currentChapterIndex
          ? 'CURRENT'
          : 'AVAILABLE'
      return {
        id: node.nodeId,
        label: `CH ${chapter}  ${node.title || 'Locked'} / ${node.summary || ''}  [${state}]`,
      }
    })
  }

  const updateHud = (patch: HudPatch) => {
    currentChapter = patch.chapter || currentChapter
    currentRoute = patch.route || currentRoute
    const nextChapterIndex = parseChapterIndex(currentChapter)
    if (nextChapterIndex >= 0) {
      currentChapterIndex = nextChapterIndex
      const node = STORY_TREE_NODES[nextChapterIndex]
      if (node) {
        void runtime.storyGraph.unlockNode(node.id)
          .then(refreshStoryTree)
          .catch(error => recordError(error, 'story-tree:unlock'))
      }
    }
    void refreshAppSurface({
      gameMenuSubtitle: `${GAME_TITLE} / CH ${currentChapter} / ${currentRoute}`,
    }).catch(error => recordError(error, 'hud:update'))
  }

  const closeFeaturePanels = async () => {
    await Promise.all([
      runtime.engine.hideUI('settings'),
      runtime.backlog.setVisible(false),
      runtime.gallery.closeScene(),
      runtime.achievement.closeBoard(),
    ])
  }

  const restoreSystemScreen = async () => {
    await refreshAppSurface({
      screen: systemReturnScreen,
      titleSurface: systemReturnTitleSurface,
    })
  }

  const openFeaturePanel = async (panel: FeaturePanel) => {
    phase(`panel:${panel}:open`)
    systemReturnScreen = appState.screen
    systemReturnTitleSurface = appState.titleSurface
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'system' })
    const openedFromTitle = systemReturnTitleSurface
    if (panel === 'settings') {
      await runtime.engine.showUI('settings', {
        ...DEMO_OVERLAY_PLACEMENTS.settings,
        title: 'Config',
        source: openedFromTitle ? 'main-menu' : 'game-menu',
        scene: createUiScene(
          openedFromTitle ? 'system:settings' : 'game:settings',
          openedFromTitle ? 'scene' : 'overlay',
          openedFromTitle ? 'main-menu' : 'game-modal',
          DEMO_OVERLAY_PLACEMENTS.settings,
        ),
      })
      return
    }
    if (panel === 'gallery') {
      await runtime.gallery.openScene({
        ...DEMO_OVERLAY_PLACEMENTS.gallery,
        catalogId: DEMO_GALLERY_CATALOG_ID,
        entryId: 'cg.title',
        reason: openedFromTitle ? 'main-menu' : 'game-menu',
        filter: { unlockedOnly: false },
      })
      return
    }
    await runtime.backlog.setVisible(true, {
      ...DEMO_OVERLAY_PLACEMENTS.backlog,
      source: 'quick-menu',
      scene: createUiScene('game:backlog', 'overlay', 'game-modal', DEMO_OVERLAY_PLACEMENTS.backlog),
    })
  }

  const startStory = async () => {
    phase('story:start')
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'game', titleSurface: false })
    try {
      await playCurrentStoryBgm()
    }
    catch (error) {
      recordError(error, 'story:bgm')
    }
    if (storyLoadPromise) {
      phase('story:resume')
      return
    }
    const scene = new MainScene(
      runtime.engine,
      updateHud,
      playDemoBgm,
      async (entryIdOrIds: DemoGalleryEntryId | readonly DemoGalleryEntryId[]) => {
        const entryIds = Array.isArray(entryIdOrIds) ? entryIdOrIds : [entryIdOrIds]
        await runtime.gallery.unlockEntries(entryIds, { source: 'story' })
      },
      () => phase('story:running'),
    )
    storyLoadPromise = runtime.engine.loadScene(scene).catch((error) => {
      storyLoadPromise = undefined
      recordError(error, 'story')
    })
  }

  const returnToTitle = async () => {
    phase('title:return')
    await closeFeaturePanels()
    await runtime.engine.stopAuto()
    await runtime.engine.stopSkip()
    await refreshAppSurface({ screen: 'title', titleSurface: true })
    await playDemoBgm(BGM.title, { gainDb: -10 })
  }

  const openStoryTree = async () => {
    await refreshStoryTree()
    await refreshAppSurface({
      screen: 'story-tree',
      storyTreeItems: appState.storyTreeItems,
      titleSurface: true,
    })
  }

  const openSaveLoad = async (mode: SaveLoadMode) => {
    saveLoadMode = mode
    saveLoadReturnScreen = appState.screen
    saveLoadReturnTitleSurface = appState.titleSurface
    const slots = new Map((await runtime.engine.listSaveSlots()).map(slot => [slot.slotId, slot]))
    const saveSlotItems = Array.from({ length: SAVE_LOAD_SLOT_COUNT }, (_, index) => {
      const id = `slot-${index + 1}`
      const slot = slots.get(id)
      const stamp = slot?.timestamp instanceof Date
        ? slot.timestamp.toISOString().slice(0, 16).replace('T', ' ')
        : ''
      return {
        id,
        label: slot
          ? `SLOT ${String(index + 1).padStart(2, '0')}\n${slot.name || 'Saved Game'}  ${stamp}`
          : `SLOT ${String(index + 1).padStart(2, '0')}\nEMPTY`,
      }
    })
    await refreshAppSurface({
      saveLoadMode: mode,
      saveLoadTitle: mode === 'save' ? 'SAVE' : 'LOAD',
      saveSlotItems,
      screen: 'save-load',
      titleSurface: saveLoadReturnTitleSurface,
    })
  }

  const closeSaveLoad = async () => {
    await refreshAppSurface({
      screen: saveLoadReturnScreen,
      titleSurface: saveLoadReturnTitleSurface,
    })
  }

  const selectSaveSlot = async (slotId: string) => {
    phase(`save:${saveLoadMode}:${slotId}`)
    if (saveLoadMode === 'save') {
      await runtime.engine.saveToSlot(slotId)
      await openSaveLoad('save')
      return
    }
    const slotExists = (await runtime.engine.listSaveSlots()).some(slot => slot.slotId === slotId)
    if (!slotExists) {
      phase('save:load:empty')
      return
    }
    await runtime.engine.loadFromSlot(slotId, { force: true, reason: 'renderer-load' })
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'game', titleSurface: false })
    await playCurrentStoryBgm()
  }

  const showGameOver = async (payload: GameOverPayload) => {
    await runtime.engine.stopAuto()
    await runtime.engine.stopSkip()
    await closeFeaturePanels()
    await refreshAppSurface({
      gameOverDescription: payload.message || appState.gameOverDescription,
      gameOverSubtitle: payload.ending ? `ENDING / ${payload.ending.toUpperCase()}` : 'ENDING',
      gameOverTitle: payload.title || 'GAME OVER',
      screen: 'game-over',
      titleSurface: false,
    })
  }

  const handleUiIntent = async (record: Record<string, unknown>): Promise<boolean> => {
    const action = typeof record.action === 'string' ? record.action : undefined
    const target = typeof record.arg0 === 'string' ? record.arg0 : undefined
    if (action === 'block') {
      return true
    }
    if (action === 'open' && target) {
      switch (target) {
        case 'story':
          await startStory()
          return true
        case 'story-tree':
          await openStoryTree()
          return true
        case 'save':
        case 'load':
          await openSaveLoad(target)
          return true
        case 'settings':
        case 'gallery':
        case 'backlog':
          await openFeaturePanel(target)
          return true
        case 'game-menu':
          await runtime.engine.stopAuto()
          await refreshAppSurface({ screen: 'game-menu', titleSurface: false })
          return true
        case 'title-confirm':
          await refreshAppSurface({ screen: 'title-confirm', titleSurface: false })
          return true
        case 'title':
          await returnToTitle()
          return true
      }
    }
    if (action === 'close' && target) {
      switch (target) {
        case 'game-menu':
          await refreshAppSurface({ screen: 'game', titleSurface: false })
          return true
        case 'title-confirm':
          await refreshAppSurface({ screen: 'game-menu', titleSurface: false })
          return true
        case 'story-tree':
          await refreshAppSurface({ screen: 'title', titleSurface: true })
          return true
        case 'save-load':
          await closeSaveLoad()
          return true
        case 'game-over':
          await refreshAppSurface({ screen: 'game', titleSurface: false })
          return true
      }
    }
    if (action === 'toggle' && target === 'auto') {
      if (runtime.engine.getFlowControlState().mode === 'auto') {
        await runtime.engine.stopAuto()
      }
      else {
        await runtime.engine.startAuto()
      }
      await refreshAppSurface()
      return true
    }
    if (action === 'toggle' && target === 'skip') {
      await runtime.engine.stopAuto()
      if (runtime.engine.getFlowControlState().mode === 'skip') {
        await runtime.engine.stopSkip()
      }
      else {
        await runtime.engine.startSkip()
      }
      await refreshAppSurface()
      return true
    }
    if (action === 'save.select' && target) {
      await selectSaveSlot(target)
      return true
    }
    return false
  }

  const pipeline = runtime.engine.getPipeline()
  const disposeGameOverListener = onLogicToRender(pipeline, LogicToRenderEvents.GAME_OVER, (payload) => {
    void showGameOver(payload).catch(error => recordError(error, 'game-over'))
  })

  await runtime.storyGraph.unlockNode(INITIAL_STORY_TREE_NODE_ID)
  await refreshStoryTree()
  await runtime.background.setBackground('ui/menu-route.jpg', { fit: 'cover' })
  await refreshAppSurface({ storyTreeItems: appState.storyTreeItems })
  await playDemoBgm(BGM.title, { gainDb: -10 })

  return {
    connectPipelineBridge(bridge) {
      const nativeProjectionBridge: NativeQuickJsPipelineBridge = {
        emit(event, payload) {
          const record = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload as Record<string, unknown>
            : undefined
          if (event === LogicToRenderEvents.VIEW_UPDATE && record?.view) {
            bridge.emit(event, {
              ...record,
              view: createNativeRendererViewProjection(
                record.view as NativeRendererEngineViewProjection,
                {
                  featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
                  projectAnimations: false,
                },
              ),
            })
            return
          }
          bridge.emit(event, payload)
        },
      }
      return installNativeQuickJsPipelineBridge(nativeProjectionBridge, pipeline, {
        initialView: runtime.engine.getViewState(),
      })
    },
    async dispatchIntent(intent) {
      diagnostics.intentCount += 1
      diagnostics.lastIntentType = intent.type
      const payload = parseNativeRendererIntentPayload(intent)
      const record = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : undefined
      diagnostics.lastAction = typeof record?.action === 'string' ? record.action : null
      phase(`intent:${intent.type}:${diagnostics.lastAction || 'none'}`)

      if (intent.type === 'ui/intent' && record) {
        let handled = false
        try {
          handled = await handleUiIntent(record)
        }
        catch (error) {
          recordError(error, `intent:${intent.type}`)
        }
        if (handled) {
          return
        }
      }
      if (intent.type === RenderToLogicEvents.USER_INPUT_COMMAND
        && record?.command === 'advance'
        && record.pressed !== false) {
        await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, {
          source: typeof record.source === 'string' ? record.source : 'native',
        })
        return
      }

      await emitNativeRendererIntentToPipeline(pipeline, intent, {
        featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
      })
      if (intent.type === 'ui/intent'
        && (record?.action === 'settings-close'
          || record?.action === 'gallery-close'
          || record?.action === 'backlog-close')) {
        phase(`panel:${String(record.action)}:restore`)
        await restoreSystemScreen()
      }
    },
    getInteractionDiagnostics() {
      return {
        intentCount: diagnostics.intentCount,
        lastIntentType: diagnostics.lastIntentType,
        lastAction: diagnostics.lastAction,
        phases: [...diagnostics.phases],
        error: diagnostics.error,
        screen: appState.screen,
      }
    },
    async destroy() {
      destroyed = true
      disposeGameOverListener()
      clearCharacterRuntime()
      await runtime.engine.destroy()
      QuaEngine.resetInstance()
    },
  }
}

function createEmptySaveSlotItems() {
  return Array.from({ length: SAVE_LOAD_SLOT_COUNT }, (_, index) => ({
    id: `slot-${index + 1}`,
    label: `SLOT ${String(index + 1).padStart(2, '0')}  EMPTY`,
  }))
}

function createStoryTreeItems() {
  return STORY_TREE_NODES.map(node => ({
    id: node.id,
    label: `CH ${node.chapter}  ${node.title} / ${node.description}`,
  }))
}

/** Default settings items shown in the settings panel. */
function createDefaultSettingItems() {
  return [
    { id: 'text-speed', label: 'TEXT SPEED', type: 'slider' as const,
      selectedIndex: 2,
      options: [
        { label: 'SLOW' }, { label: 'NORMAL' }, { label: 'FAST' }, { label: 'INSTANT' },
      ] },
    { id: 'auto-speed', label: 'AUTO SPEED', type: 'slider' as const,
      selectedIndex: 1,
      options: [{ label: 'SLOW' }, { label: 'NORMAL' }, { label: 'FAST' }] },
    { id: 'bgm-volume', label: 'BGM VOLUME', type: 'slider' as const,
      selectedIndex: 7,
      options: Array.from({ length: 11 }, (_, i) => ({ label: `${i * 10}%` })) },
    { id: 'sfx-volume', label: 'SFX VOLUME', type: 'slider' as const,
      selectedIndex: 7,
      options: Array.from({ length: 11 }, (_, i) => ({ label: `${i * 10}%` })) },
    { id: 'voice-volume', label: 'VOICE VOLUME', type: 'slider' as const,
      selectedIndex: 7,
      options: Array.from({ length: 11 }, (_, i) => ({ label: `${i * 10}%` })) },
    { id: 'skip-unread', label: 'SKIP UNREAD', type: 'switch' as const,
      selectedIndex: 0,
      options: [{ label: 'OFF' }, { label: 'ON' }] },
    { id: 'fullscreen', label: 'FULLSCREEN', type: 'switch' as const,
      selectedIndex: 0,
      options: [{ label: 'OFF' }, { label: 'ON' }] },
  ]
}

/**
 * Minimal English translation lookup for the native demo UI.
 * In a real product this would delegate to an i18n library.
 */
function nativeDemoUiString(key: string): string {
  const strings: Record<string, string> = {
    'ui.title.start':      'START',
    'ui.title.load':       'LOAD',
    'ui.title.storyTree':  'STORY TREE',
    'ui.title.gallery':    'GALLERY',
    'ui.title.config':     'CONFIG',
    'ui.hud.subtitle':     'TOKYO 2048',
    'ui.hud.log':          'LOG',
    'ui.hud.menu':         'MENU',
    'ui.gameMenu.menu':    'MENU',
    'ui.storyTree.eyebrow':'ROUTE MAP',
    'ui.storyTree.title':  'STORY TREE',
    'ui.saveLoad.eyebrow': 'ARCHIVE',
    'ui.backlog.eyebrow':  'DIALOGUE LOG',
    'ui.backlog.title':    'BACKLOG',
    'ui.gallery.eyebrow':  'CG COLLECTION',
    'ui.gallery.title':    'GALLERY',
    'ui.settings.title':   'CONFIG',
    'ui.settings.off':     'OFF',
    'ui.settings.on':      'ON',
    'ui.titleConfirm.title':      '回到标题菜单？',
    'ui.titleConfirm.subtitle':   '当前进度不会自动保存',
    'ui.titleConfirm.description':'故事运行状态会保留在后台，START 会回到当前进度。',
    'ui.common.close':     'CLOSE',
    'ui.common.cancel':    'CANCEL',
    'ui.common.title':     'TITLE',
    'ui.common.save':      'SAVE',
    'ui.common.load':      'LOAD',
    'ui.common.config':    'CONFIG',
    'ui.common.backlog':   'BACKLOG',
  }
  return strings[key] ?? key
}
