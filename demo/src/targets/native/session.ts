import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { LogicToRenderEvents, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import {
  createNativeRendererJsonFrameInput,
  createNativeRendererViewProjection,
  emitNativeRendererIntentToPipeline,
  installNativeQuickJsPipelineBridge,
  type NativeQuickJsPipelineBridge,
  type NativeRendererEngineViewProjection,
} from '@quajs/engine-native'
import { parseNativeRendererIntentPayload, type NativeRendererIntent } from '@quajs/native-contracts'
import { BGM, DEFAULT_BGM_OPTIONS } from '../../game/config'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import { MainScene } from '../../game/story/main-scene'
import { DEMO_NATIVE_FEATURE_SURFACES } from './features'
import { isNativeDemoPanel, openNativeDemoPanel, type NativeDemoPanel } from './panels'
import {
  createNativeDemoMenuSurface,
  createNativeMainMenuSurface,
  createNativeSaveLoadSurface,
  createNativeStoryTreeSurface,
  stageNativeCoverageScene,
  stageWebParityScene,
} from './scenes'

export type NativeDemoFixture = NativeDemoPanel | 'effects' | 'interactive' | 'parity' | 'transition' | 'typewriter'

export interface DemoNativeSession {
  connectPipelineBridge: (bridge: NativeQuickJsPipelineBridge) => () => void
  destroy: () => Promise<void>
  dispatchIntent: (intent: NativeRendererIntent) => Promise<void>
  getInteractionDiagnostics: () => Record<string, unknown>
  renderOfflineFrame: () => ReturnType<typeof createNativeRendererJsonFrameInput>
}

interface InteractionDiagnostics {
  intentCount: number
  lastIntentType: string | null
  lastAction: string | null
  phases: string[]
  error: string | null
}

export async function createDemoNativeSession(fixture?: string): Promise<DemoNativeSession> {
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
  const interactiveStory = fixture === undefined || fixture === 'interactive'
  configureCharacterRuntime({ engine: runtime.engine, waitForAdvance: interactiveStory ? true : false })

  if (fixture === 'parity') {
    await stageWebParityScene(runtime)
  }
  else if (interactiveStory) {
    await runtime.background.setBackground('backgrounds/blackout-city.jpg', { fit: 'cover' })
    await runtime.engine.showUI('native-main-menu', createNativeMainMenuSurface())
  }
  else {
    await stageNativeCoverageScene(runtime)
    await runtime.engine.showUI('native-dev-status', createNativeDemoMenuSurface())
  }
  await runtime.audio.playBGM(interactiveStory ? BGM.title : BGM.blackout, {
    ...DEFAULT_BGM_OPTIONS,
    id: 'demo-native-bgm',
  })
  if (isNativeDemoPanel(fixture)) {
    await openNativeDemoPanel(runtime, fixture)
  }
  if (fixture === 'effects') {
    await runtime.engine.applyEffect({
      id: 'demo.native.flash',
      type: 'flash',
      intensity: 0.24,
      options: { color: '#71d7f3', opacity: 0.24 },
    })
  }

  let storyLoadPromise: Promise<void> | undefined
  const diagnostics: InteractionDiagnostics = {
    intentCount: 0,
    lastIntentType: null,
    lastAction: null,
    phases: [],
    error: null,
  }
  const phase = (value: string) => {
    diagnostics.phases.push(value)
    if (diagnostics.phases.length > 24) {
      diagnostics.phases.shift()
    }
  }
  const startStory = async () => {
    if (!interactiveStory || storyLoadPromise) {
      phase(!interactiveStory ? 'start:ignored-noninteractive' : 'start:ignored-inflight')
      return
    }
    phase('start:begin')
    const pipeline = runtime.engine.getPipeline()
    let resolveFirstDialogue: (() => void) | undefined
    const firstDialogue = new Promise<void>(resolve => {
      resolveFirstDialogue = resolve
    })
    const onFirstDialogue = () => {
      pipeline.off(LogicToRenderEvents.DIALOGUE_SHOW, onFirstDialogue)
      resolveFirstDialogue?.()
    }
    pipeline.on(LogicToRenderEvents.DIALOGUE_SHOW, onFirstDialogue)
    const scenePromise = (async () => {
      phase('start:hide-menu')
      await runtime.engine.hideUI('native-main-menu')
      phase('start:play-bgm')
      await runtime.audio.playBGM(BGM.blackout, { ...DEFAULT_BGM_OPTIONS, id: 'demo-native-bgm' })
      phase('start:load-scene')
      await runtime.engine.loadScene(new MainScene(
        runtime.engine,
        () => {},
        async (assetKey, options = {}) => {
          await runtime.audio.playBGM(assetKey, { ...DEFAULT_BGM_OPTIONS, ...options, id: 'demo-native-bgm' })
        },
        async entryIds => {
          const ids = Array.isArray(entryIds) ? entryIds : [entryIds]
          await runtime.gallery.unlockEntries(ids, { source: 'story' })
        },
        () => {},
      ))
      phase('start:scene-loaded')
    })()
    storyLoadPromise = scenePromise.catch(error => {
      storyLoadPromise = undefined
      diagnostics.error = error instanceof Error ? error.message : String(error)
      phase('start:error')
    })
    phase('start:show-hud')
    await runtime.engine.showUI('native-dev-status', createNativeDemoMenuSurface())
    try {
      await Promise.race([firstDialogue, scenePromise])
      phase('start:first-dialogue-or-scene')
    }
    finally {
      pipeline.off(LogicToRenderEvents.DIALOGUE_SHOW, onFirstDialogue)
      phase('start:return')
    }
  }

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
      const dispose = installNativeQuickJsPipelineBridge(nativeProjectionBridge, runtime.engine.getPipeline(), {
        initialView: runtime.engine.getViewState(),
      })
      if (fixture === 'transition') {
        void runtime.engine.getPipeline().emit(LogicToRenderEvents.SCENE_CHANGE, {
          fromScene: 'native-demo-loading',
          toScene: 'native-demo',
          transition: {
            type: 'wipe',
            duration: 800,
          },
        })
      }
      return dispose
    },
    async dispatchIntent(intent) {
      diagnostics.intentCount += 1
      diagnostics.lastIntentType = intent.type
      const payload = parseNativeRendererIntentPayload(intent)
      const action = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).action
        : undefined
      diagnostics.lastAction = typeof action === 'string' ? action : null
      phase(`intent:${intent.type}:${diagnostics.lastAction || 'none'}`)
      if (interactiveStory && intent.type === 'ui/intent' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>
        if (record.action === 'demo-start-story') {
          phase('intent:start-story')
          await startStory()
          phase('intent:start-story-return')
          return
        }
        if (record.action === 'demo-open-story-tree') {
          await runtime.engine.hideUI('native-main-menu')
          await runtime.engine.showUI('native-story-tree', createNativeStoryTreeSurface())
          return
        }
        if (record.action === 'demo-open-save-load') {
          await runtime.engine.hideUI('native-main-menu')
          const slots = (await runtime.engine.listSaveSlots()).map(slot => ({
            id: slot.slotId,
            name: slot.name,
            updatedAt: slot.timestamp.getTime(),
          }))
          await runtime.engine.showUI('native-save-load', createNativeSaveLoadSurface(slots))
          return
        }
        if (record.action === 'demo-close-main-overlay') {
          await runtime.engine.hideUI('native-story-tree')
          await runtime.engine.hideUI('native-save-load')
          await runtime.engine.showUI('native-main-menu', createNativeMainMenuSurface())
          return
        }
      }
      if (intent.type === 'ui/intent'
        && payload
        && typeof payload === 'object'
        && !Array.isArray(payload)
        && (payload as Record<string, unknown>).action === 'demo-open-panel'
        && isNativeDemoPanel((payload as Record<string, unknown>).panel)) {
        await openNativeDemoPanel(runtime, (payload as Record<string, unknown>).panel as NativeDemoPanel)
        return
      }
      if (interactiveStory && intent.type === RenderToLogicEvents.USER_INPUT_COMMAND) {
        const record = payload as Record<string, unknown> | undefined
        if (record?.command === 'advance' && record.pressed !== false) {
          await runtime.engine.getPipeline().emit(RenderToLogicEvents.USER_ADVANCE, {
            source: record.source || 'native',
          })
          return
        }
      }
      await emitNativeRendererIntentToPipeline(runtime.engine.getPipeline(), intent, {
        featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
      })
    },
    getInteractionDiagnostics() {
      return {
        intentCount: diagnostics.intentCount,
        lastIntentType: diagnostics.lastIntentType,
        lastAction: diagnostics.lastAction,
        phases: [...diagnostics.phases],
        error: diagnostics.error,
      }
    },
    renderOfflineFrame() {
      const view = runtime.engine.getViewState()
      const projectedView = fixture === 'transition'
        ? {
            ...view,
            sceneTransition: {
              active: true,
              type: 'wipe',
              fromScene: 'native-demo-loading',
              toScene: 'native-demo',
              duration: 800,
              startedAt: Date.now() - 400,
              progress: 0.5,
              easedProgress: 0.5,
            },
          }
        : view
      return createNativeRendererJsonFrameInput(projectedView as unknown as NativeRendererEngineViewProjection, {
        featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
      })
    },
    async destroy() {
      clearCharacterRuntime()
      await runtime.engine.destroy()
      QuaEngine.resetInstance()
    },
  }
}
