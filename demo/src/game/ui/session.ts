import type { GameOverPayload } from '@quajs/engine'
import type { MiddlewareFunction } from '@quajs/pipeline'
import type { createDemoEngineRuntime } from '../runtime-shared'
import type { StoryLibrary } from '../story/prologue-state'
import type { HudPatch } from '../types'
import type { DemoAppScreen, DemoAppSurfaceState } from './surface'
import { LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import { BASE_SETTINGS_SCOPE, getSettingsPlayerValues } from '@quajs/plugin-settings'
import { createSaveSlotGrid, resolveUiFeatureIntent } from '@quajs/render-core'
import { GAME_TITLE, SAVE_LOAD_SLOT_COUNT } from '../config'
import { DEMO_GALLERY_CATALOG_ID } from '../content/gallery'
import { STORY_TREE_NODES } from '../content/story-tree'
import { DEMO_LIBRARY_PLUGIN_ID, DEMO_STORY_REQUEST } from '../story/prologue-state'
import { DEMO_TITLE_CONFIRM, demoChapterLabel, toggleDemoFlowControl } from '../ui-presentation'
import { DEMO_UI_FEATURE_SURFACES } from './features'
import { createUiScene, DEMO_OVERLAY_PLACEMENTS, parseChapterIndex } from './scene'
import { createDemoAppSurface, DEMO_APP_ELEMENT_ID } from './surface'

type FeaturePanel = 'backlog' | 'gallery' | 'settings'
type SaveLoadMode = 'load' | 'save'
interface InteractionDiagnostics {
  intentCount: number
  lastIntentType: string | null
  lastAction: string | null
  phases: string[]
  error: string | null
}

/** Application navigation lives beside the engine, shared by both renderers. */
export async function createDemoUiSession(runtime: Awaited<ReturnType<typeof createDemoEngineRuntime>>) {
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
    console.error(`[demo-ui] ${context} failed: ${diagnostics.error}`)
    if (runtime.editorPreview)
      void runtime.engine.getPipeline().emit('editor/preview/error', { message: diagnostics.error }).catch(() => {})
  }

  let destroyed = false
  let currentChapterIndex = -1
  let currentChapter = 'BOOT'
  let currentRoute = 'UNDECIDED'
  let systemReturnScreen: DemoAppScreen = 'title'
  let systemReturnTitleSurface = true
  let saveLoadMode: SaveLoadMode = 'load'
  let saveLoadReturnScreen: DemoAppScreen = 'title'
  let saveLoadReturnTitleSurface = true

  let appState: DemoAppSurfaceState = {
    t: demoUiString,
    canContinue: false,
    autoActive: false,
    gameOverDescription: '故事已经结束。你可以回到标题菜单，或关闭面板停留在当前画面。',
    gameOverSubtitle: 'ENDING',
    gameOverTitle: 'GAME OVER',
    gameMenuSubtitle: `${GAME_TITLE} / CH BOOT / UNDECIDED`,
    saveLoadMode,
    saveLoadTitle: '读取',
    saveSlotItems: createSaveSlotGrid({ slotCount: SAVE_LOAD_SLOT_COUNT }),
    screen: 'title',
    skipActive: false,
    storyTreeItems: createStoryTreeItems(),
    title: GAME_TITLE,
    titleSurface: true,
  }

  const refreshAppSurface = async (patch: Partial<DemoAppSurfaceState> = {}) => {
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
    await runtime.engine.showUI(DEMO_APP_ELEMENT_ID, {
      ...createDemoAppSurface(appState, runtime.engine.getViewState().layout),
      screen: appState.screen,
      titleSurface: appState.titleSurface,
      scene: createUiScene(`demo:${appState.screen}`, appState.titleSurface ? 'scene' : 'overlay', appState.titleSurface ? 'main-menu' : 'game-modal', {
        defaultChrome: !appState.titleSurface && appState.screen !== 'system',
        hideDialogue: appState.titleSurface || appState.screen === 'system',
        hideHud: appState.screen !== 'game',
        overlayStack: 'hud',
      }),
    })
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
        label: node.spoilerHidden ? '尚未阅读' : node.title || '未读章节',
        chapter,
        description: node.spoilerHidden ? undefined : node.summary,
        current: state === 'CURRENT',
        unlocked: node.unlocked,
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
      gameMenuSubtitle: `${demoChapterLabel(currentChapter)} · ${STORY_TREE_NODES.find(node => node.chapter === currentChapter)?.title || ''}`,
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
      scene: createUiScene('game:backlog', 'overlay', 'game-modal', { ...DEMO_OVERLAY_PLACEMENTS.backlog, hideDialogue: true, defaultChrome: false }),
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
    if (appState.screen !== 'save-load' && appState.screen !== 'save-confirm') {
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
    if (action === 'open' && target === 'save' && appState.titleSurface)
      return true
    if (action === 'open' && target) {
      switch (target) {
        case 'quit-confirm':
          if (appState.screen !== 'title')
            return true
          if (getSettingsPlayerValues(runtime.engine, BASE_SETTINGS_SCOPE)?.confirmBeforeQuit === false)
            await runtime.engine.getPipeline().emit('app/quit', {})
          else await refreshAppSurface({ screen: 'quit-confirm', titleSurface: true })
          return true
        case 'quit':
          if (appState.screen === 'quit-confirm')
            await runtime.engine.getPipeline().emit('app/quit', {})
          return true
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
        case 'quit-confirm':
          await refreshAppSurface({ screen: 'title', titleSurface: true })
          return true
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
    if (action === 'toggle' && target === 'screenshot') {
      await runtime.engine.getPipeline().emit(RenderToLogicEvents.USER_INPUT_COMMAND, { command: 'ui:screenshot', source: 'toolbar' })
      return true
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
      if (slotId === appState.pendingSaveSlotId)
        await selectSaveSlot(slotId, true)
      return true
    }
    if (action === 'save.select' && target) {
      await selectSaveSlot(target)
      return true
    }
    return false
  }

  const pipeline = runtime.engine.getPipeline()
  const previewEnter = async () => {
    await closeFeaturePanels()
    await refreshAppSurface({ screen: 'game', titleSurface: false })
  }
  if (runtime.editorPreview)
    pipeline.on('editor/preview/enter', previewEnter)

  const disposeGameOverListener = onLogicToRender(pipeline, LogicToRenderEvents.GAME_OVER, (payload) => {
    void showGameOver(payload).catch(error => recordError(error, 'game-over'))
  })

  await refreshStoryTree()
  await refreshAppSurface({ storyTreeItems: appState.storyTreeItems })

  const handleInput = async (record: Record<string, unknown>) => {
    if (record.pressed === false)
      return false
    if (record.command === 'ui:cancel' || record.command === 'ui:menu') {
      if (appState.screen === 'game') {
        await handleUiIntent({ action: 'open', arg0: record.device === 'wheel' ? 'backlog' : 'game-menu' })
      }
      else if (appState.screen === 'system') {
        await closeFeaturePanels()
        await restoreSystemScreen()
      }
      else if (appState.screen !== 'title') {
        await handleUiIntent({ action: 'close', arg0: appState.screen })
      }
      return true
    }
    return appState.screen !== 'game' && record.command !== 'ui:screenshot'
  }
  const middleware: MiddlewareFunction = async (context, next) => {
    const { type, payload } = context.event
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    if (runtime.engine.getViewState().ui.visible === false)
      return next()
    if (type === 'ui/intent' || type === RenderToLogicEvents.USER_INPUT_COMMAND) {
      diagnostics.intentCount++
      diagnostics.lastIntentType = type
      diagnostics.lastAction = typeof record.action === 'string' ? record.action : null
      phase(`intent:${type}:${diagnostics.lastAction || 'none'}`)
      try {
        const handled = type === 'ui/intent' ? await handleUiIntent(record) : await handleInput(record)
        if (handled) {
          context.handled = true
          return
        }
        if (type === 'ui/intent') {
          const feature = resolveUiFeatureIntent(DEMO_UI_FEATURE_SURFACES, String(record.action), record)
          if (feature) {
            await pipeline.emit(feature.event, feature.payload)
            if (record.action === 'gallery-select-entry') {
              const selected = runtime.gallery.getProjection().entries.find(entry => entry.id === record.entryId)
              if (selected && (selected.contents.length || selected.thumbnail || selected.poster))
                await runtime.engine.showUI('gallery-preview', { renderMode: 'render-only', surface: { key: 'gallery-preview' } })
            }
            if (['settings-close', 'gallery-close', 'backlog-close'].includes(String(record.action)))
              await restoreSystemScreen()
            context.handled = true
            return
          }
        }
      }
      catch (error) {
        recordError(error, type)
        throw error
      }
    }
    if (type === RenderToLogicEvents.USER_ADVANCE && appState.screen !== 'game')
      return
    await next()
  }
  pipeline.addMiddleware(middleware)
  // Flow mode and resume availability are engine-owned; reproject only when they change.
  const sync = onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, () => {
    const view = runtime.engine.getViewState()
    const canContinue = Boolean((view.plugins[DEMO_LIBRARY_PLUGIN_ID] as StoryLibrary | undefined)?.canContinue)
    if (canContinue !== appState.canContinue || (view.flowControl.mode === 'auto') !== appState.autoActive || (view.flowControl.mode === 'skip') !== appState.skipActive)
      void refreshAppSurface().catch(error => recordError(error, 'projection'))
  })
  return {
    getInteractionDiagnostics: () => ({ ...diagnostics, phases: [...diagnostics.phases], screen: appState.screen }),
    dispose() {
      destroyed = true
      sync()
      pipeline.removeMiddleware(middleware)
      pipeline.off('editor/preview/enter', previewEnter)
      disposeGameOverListener()
    },
  }
}
function createStoryTreeItems() {
  return STORY_TREE_NODES.map(node => ({
    id: node.id,
    label: '尚未阅读',
    chapter: node.chapter,
    disabled: true,
    unlocked: false,
  }))
}

function demoUiString(key: string): string {
  const strings: Record<string, string> = {
    'ui.title.start': '从头开始',
    'ui.title.load': '读取存档',
    'ui.title.storyTree': '章节选择',
    'ui.title.gallery': 'GALLERY',
    'ui.title.config': '设置',
    'ui.title.quit': '退出游戏',
    'ui.hud.log': '记录',
    'ui.hud.menu': '菜单',
    'ui.gameMenu.menu': '菜单',
    'ui.storyTree.eyebrow': '六月的声音',
    'ui.storyTree.title': '章节选择',
    'ui.saveLoad.eyebrow': 'ARCHIVE',
    'ui.backlog.eyebrow': '已读对白',
    'ui.backlog.title': '对话记录',
    'ui.gallery.eyebrow': 'CG COLLECTION',
    'ui.gallery.title': 'GALLERY',
    'ui.settings.title': '设置',
    'ui.settings.off': 'OFF',
    'ui.settings.on': 'ON',
    'ui.titleConfirm.title': DEMO_TITLE_CONFIRM.title,
    'ui.titleConfirm.subtitle': DEMO_TITLE_CONFIRM.subtitle,
    'ui.titleConfirm.description': DEMO_TITLE_CONFIRM.description,
    'ui.common.close': '关闭',
    'ui.common.cancel': '取消',
    'ui.common.title': '返回标题',
    'ui.common.save': '保存',
    'ui.common.load': '读取',
    'ui.common.config': '设置',
    'ui.common.backlog': '记录',
  }
  return strings[key] ?? key
}
