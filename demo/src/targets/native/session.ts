import { projectDemoNativeView } from './presentation'
import { createSaveSlotGrid } from '@quajs/render-core'
import { DEMO_TITLE_CONFIRM, toggleDemoFlowControl } from '../../game/ui-presentation'
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
  emitNativeRendererIntentToPipeline,
  installNativeQuickJsPipelineBridge,
  type NativeQuickJsPipelineBridge,
  type NativeRendererEngineViewProjection,
} from '@quajs/engine-native'
import { parseNativeRendererIntentPayload, type NativeRendererIntent } from '@quajs/native-contracts'
import { GAME_ENGLISH_TITLE, GAME_TITLE, SAVE_LOAD_SLOT_COUNT } from '../../game/config'
import { DEMO_GALLERY_CATALOG_ID } from '../../game/content/gallery'
import { STORY_TREE_NODES } from '../../game/content/story-tree'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import { DEMO_STORY_REQUEST, DEMO_LIBRARY_PLUGIN_ID, type StoryLibrary } from '../../game/story/prologue-state'
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
        name: 'Call Me Again Tomorrow Demo',
        bundleId: 'dev.quajs.demo.callmetomorrow',
        version: '0.1.0',
      },
      layout: 'landscape',
      assets: { adapter: createMemoryAssetsAdapter(), locale: 'default', enableCache: false },
      flowControl: { skipMode: 'read' },
      dialogue: {
        typewriter: { enabled: true, charactersPerSecond: 36, revealOnAdvance: true },
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
  let systemReturnScreen: NativeDemoAppScreen = 'title'
  let systemReturnTitleSurface = true
  let saveLoadMode: SaveLoadMode = 'load'
  let saveLoadReturnScreen: NativeDemoAppScreen = 'title'
  let saveLoadReturnTitleSurface = true

  let appState: NativeDemoAppSurfaceState = {
    t: nativeDemoUiString,
    canContinue: false,
    autoActive: false,
    englishTitle: GAME_ENGLISH_TITLE,
    gameOverDescription: '故事已经结束。你可以回到标题菜单，或关闭面板停留在当前画面。',
    gameOverSubtitle: 'ENDING',
    gameOverTitle: 'GAME OVER',
    gameMenuSubtitle: `${GAME_TITLE} / CH BOOT / UNDECIDED`,
    saveLoadMode,
    saveLoadTitle: '读取',
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
      canContinue: Boolean((runtime.engine.getViewState().plugins[DEMO_LIBRARY_PLUGIN_ID] as StoryLibrary | undefined)?.canContinue),
      autoActive: flowMode === 'auto',
      skipActive: flowMode === 'skip',
    }
    await runtime.engine.showUI(NATIVE_DEMO_APP_ELEMENT_ID, createNativeDemoAppSurface(appState, runtime.engine.getViewState().layout))
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
        label: state === 'LOCKED' ? '未读章节' : node.title || '未读章节',
        disabled: node.entryLocked,
      }
    })
  }

  const updateHud = (patch: HudPatch) => {
    currentChapter = patch.chapter || currentChapter
    currentRoute = patch.route || currentRoute
    const nextChapterIndex = parseChapterIndex(currentChapter)
    if (nextChapterIndex >= 0) {
      currentChapterIndex = nextChapterIndex
    }
    void refreshAppSurface({
      gameMenuSubtitle: STORY_TREE_NODES.find(node => node.chapter === currentChapter)?.title || '',
    }).catch(error => recordError(error, 'hud:update'))
  }

  const closeFeaturePanels = async () => {
    await Promise.all([
      runtime.engine.hideUI('settings'),
      runtime.engine.hideUI('gallery-preview'),
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
    systemReturnScreen = appState.screen === 'game-menu' ? 'game' : appState.screen
    systemReturnTitleSurface = appState.titleSurface
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'system' })
    const openedFromTitle = systemReturnTitleSurface
    if (panel === 'settings') {
      await runtime.engine.showUI('settings', {
        ...DEMO_OVERLAY_PLACEMENTS.settings,
        title: '设置',
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

  const startStory = async (action: 'start' | 'continue' = 'start') => {
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'game', titleSurface: false })
    await runtime.engine.getPipeline().emit(DEMO_STORY_REQUEST, { action })
    await refreshAppSurface({ screen: 'game', titleSurface: false })
  }

  const returnToTitle = async () => {
    phase('title:return')
    await closeFeaturePanels()
    await runtime.engine.getPipeline().emit(DEMO_STORY_REQUEST, { action: 'pause' })
    await refreshAppSurface({ screen: 'title', titleSurface: true })
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
    if (appState.screen !== 'save-load') {
      saveLoadReturnScreen = appState.screen === 'game-menu' ? 'game' : appState.screen
      saveLoadReturnTitleSurface = appState.titleSurface
    }
    const saveSlotItems = createSaveSlotGrid({ slotCount: SAVE_LOAD_SLOT_COUNT }, await runtime.engine.listSaveSlots())
    await refreshAppSurface({
      saveLoadMode: mode,
      saveLoadTitle: mode === 'save' ? '保存' : '读取',
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

  const selectSaveSlot = async (slotId: string, confirmed = false) => {
    phase(`save:${saveLoadMode}:${slotId}`)
    if (saveLoadMode === 'save') {
      if (!confirmed && (await runtime.engine.listSaveSlots()).some(slot => slot.slotId === slotId)) {
        await refreshAppSurface({ screen: 'save-confirm', pendingSaveSlotId: slotId })
        return
      }
      await runtime.engine.saveToSlot(slotId)
      await openSaveLoad('save')
      return
    }
    const slotExists = (await runtime.engine.listSaveSlots()).some(slot => slot.slotId === slotId)
    if (!slotExists) {
      phase('save:load:empty')
      return
    }
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'game', titleSurface: false })
    await runtime.engine.loadFromSlot(slotId, { force: true, reason: 'renderer-load' })
    updateHud({ chapter: runtime.engine.getStoryPoint()?.chapterId || '00', route: STORY_TREE_NODES.find(node => node.chapter === runtime.engine.getStoryPoint()?.chapterId)?.title || '' })
    await refreshAppSurface({ screen: 'game', titleSurface: false })
  }

  const showGameOver = async (payload: GameOverPayload) => {
    await runtime.engine.stopAuto()
    await runtime.engine.stopSkip()
    await closeFeaturePanels()
    await refreshAppSurface({
      gameOverDescription: payload.message || appState.gameOverDescription,
      gameOverSubtitle: payload.ending === 'handoff' ? '短结局' : payload.ending === 'letter' ? '普通结局' : '完整结局',
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
    if (action === 'open' && target === 'save' && appState.titleSurface) return true
    if (action === 'open' && target) {
      switch (target) {
        case 'continue':
          await startStory('continue')
          return true
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
          updateHud({ chapter: runtime.engine.getStoryPoint()?.chapterId || '00', route: STORY_TREE_NODES.find(node => node.chapter === runtime.engine.getStoryPoint()?.chapterId)?.title || '' })
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
          await refreshAppSurface({ screen: 'game', titleSurface: false })
          return true
        case 'story-tree':
          await refreshAppSurface({ screen: 'title', titleSurface: true })
          return true
        case 'save-confirm':
          await refreshAppSurface({ screen: 'save-load', pendingSaveSlotId: undefined })
          return true
        case 'save-load':
          await closeSaveLoad()
          return true
        case 'game-over':
          await refreshAppSurface({ screen: 'game', titleSurface: false })
          return true
      }
    }
    if (action === 'toggle' && (target === 'auto' || target === 'skip')) {
      await toggleDemoFlowControl(runtime.engine, target)
      await refreshAppSurface()
      return true
    }
    if (action === 'open' && target?.startsWith('chapter:')) {
      await runtime.engine.getPipeline().emit(DEMO_STORY_REQUEST, { action: 'chapter', nodeId: target.slice(8) })
      await refreshAppSurface({ screen: 'game', titleSurface: false })
      return true
    }
    if (action === 'open' && target?.startsWith('save-overwrite:') && appState.screen === 'save-confirm') {
      const slotId = target.slice('save-overwrite:'.length)
      if (slotId === appState.pendingSaveSlotId) await selectSaveSlot(slotId, true)
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

  await refreshStoryTree()
  await refreshAppSurface({ storyTreeItems: appState.storyTreeItems })

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
              view: projectDemoNativeView(record.view as NativeRendererEngineViewProjection),
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
        && (record?.command === 'ui:cancel' || record?.command === 'ui:menu')
        && record.pressed !== false) {
        if (appState.screen === 'game') await handleUiIntent({ action: 'open', arg0: 'game-menu' })
        else if (appState.screen === 'system') { await closeFeaturePanels(); await restoreSystemScreen() }
        else if (appState.screen !== 'title') await handleUiIntent({ action: 'close', arg0: appState.screen })
        return
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
      if (intent.type === 'ui/intent' && record?.action === 'gallery-select-entry') {
        const selected = runtime.gallery.getProjection().entries.find(entry => entry.id === record.entryId)
        if (selected && (selected.contents.length || selected.thumbnail || selected.poster)) {
          await runtime.engine.showUI('gallery-preview', { renderMode: 'render-only', surface: { key: 'gallery-preview' } })
        }
      }
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
  return createSaveSlotGrid({ slotCount: SAVE_LOAD_SLOT_COUNT })
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
    'ui.title.start':      '从头开始',
    'ui.title.load':       '读取存档',
    'ui.title.storyTree':  '章节选择',
    'ui.title.gallery':    'GALLERY',
    'ui.title.config':     '设置',
    'ui.hud.log':          '记录',
    'ui.hud.menu':         '菜单',
    'ui.gameMenu.menu':    '菜单',
    'ui.storyTree.eyebrow':'六月的声音',
    'ui.storyTree.title':  '章节选择',
    'ui.saveLoad.eyebrow': 'ARCHIVE',
    'ui.backlog.eyebrow':  '已读对白',
    'ui.backlog.title':    '对话记录',
    'ui.gallery.eyebrow':  'CG COLLECTION',
    'ui.gallery.title':    'GALLERY',
    'ui.settings.title':   '设置',
    'ui.settings.off':     'OFF',
    'ui.settings.on':      'ON',
    'ui.titleConfirm.title': DEMO_TITLE_CONFIRM.title,
    'ui.titleConfirm.subtitle': DEMO_TITLE_CONFIRM.subtitle,
    'ui.titleConfirm.description': DEMO_TITLE_CONFIRM.description,
    'ui.common.close':     '关闭',
    'ui.common.cancel':    '取消',
    'ui.common.title':     '返回标题',
    'ui.common.save':      '保存',
    'ui.common.load':      '读取',
    'ui.common.config':    '设置',
    'ui.common.backlog':   '记录',
  }
  return strings[key] ?? key
}
