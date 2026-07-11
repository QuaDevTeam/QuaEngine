import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { QuaEngine } from '@quajs/engine'
import {
  createNativeRendererJsonFrameInput,
  emitNativeRendererIntentToPipeline,
  NativeDialogueTypewriterController,
  type NativeRendererEngineViewProjection,
} from '@quajs/engine-native'
import { parseNativeRendererIntentPayload, type NativeRendererIntent } from '@quajs/native-contracts'
import type { ViewDialogueProjection } from '@quajs/render-core'
import { BGM, DEFAULT_BGM_OPTIONS } from '../../game/config'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import { DEMO_NATIVE_FEATURE_SURFACES } from './features'
import { isNativeDemoPanel, openNativeDemoPanel, type NativeDemoPanel } from './panels'
import { createNativeDemoMenuSurface, stageNativeCoverageScene, stageWebParityScene } from './scenes'

export type NativeDemoFixture = NativeDemoPanel | 'effects' | 'parity' | 'transition' | 'typewriter'

export interface DemoNativeSession {
  destroy: () => Promise<void>
  dispatchIntent: (intent: NativeRendererIntent) => Promise<void>
  renderFrame: () => ReturnType<typeof createNativeRendererJsonFrameInput>
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
  configureCharacterRuntime({ engine: runtime.engine, waitForAdvance: false })

  if (fixture === 'parity') {
    await stageWebParityScene(runtime)
  }
  else {
    await stageNativeCoverageScene(runtime)
    await runtime.engine.showUI('native-dev-status', createNativeDemoMenuSurface())
  }
  await runtime.audio.playBGM(BGM.blackout, { ...DEFAULT_BGM_OPTIONS, id: 'demo-native-bgm' })
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

  const initialView = runtime.engine.getViewState()
  const startedAt = initialView.animations[0]?.startedAt ?? Date.now()
  const typewriter = fixture === 'typewriter' ? new NativeDialogueTypewriterController() : undefined
  if (typewriter) {
    typewriter.project(initialView.dialogue as Readonly<ViewDialogueProjection>, startedAt)
  }

  return {
    async dispatchIntent(intent) {
      const payload = parseNativeRendererIntentPayload(intent)
      if (intent.type === 'ui/intent'
        && payload
        && typeof payload === 'object'
        && !Array.isArray(payload)
        && (payload as Record<string, unknown>).action === 'demo-open-panel'
        && isNativeDemoPanel((payload as Record<string, unknown>).panel)) {
        await openNativeDemoPanel(runtime, (payload as Record<string, unknown>).panel as NativeDemoPanel)
        return
      }
      await emitNativeRendererIntentToPipeline(runtime.engine.getPipeline(), intent, {
        featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
      })
    },
    renderFrame() {
      const view = runtime.engine.getViewState()
      return createNativeRendererJsonFrameInput(view as unknown as NativeRendererEngineViewProjection, {
        dialogueTypewriter: typewriter,
        featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
        now: fixture === 'typewriter' ? startedAt + 600 : Date.now(),
        sceneTransition: fixture === 'transition'
          ? {
              active: true,
              type: 'wipe',
              fromScene: 'native-demo-loading',
              toScene: 'native-demo',
              duration: 800,
              startedAt: startedAt + 500,
              progress: 0.5,
              easedProgress: 0.5,
            }
          : undefined,
      })
    },
    async destroy() {
      clearCharacterRuntime()
      await runtime.engine.destroy()
      QuaEngine.resetInstance()
    },
  }
}
