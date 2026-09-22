import type { NativeJscPipelineBridge, NativeRendererEngineViewProjection } from '@quajs/engine-native'
import type { NativeRendererIntent } from '@quajs/native-contracts'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { clearCharacterRuntime, configureCharacterRuntime, resolveCharacterRef } from '@quajs/character'
import { collectUpcomingAssetHints, LogicToRenderEvents, QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { emitNativeRendererIntentToPipeline, installNativeJscPipelineBridge } from '@quajs/engine-native'
import { parseNativeRendererIntentPayload } from '@quajs/native-contracts'
import { AssetLoadingPlugin, ASSET_LOADING_RENDERER_PROGRESS } from '@quajs/plugin-asset-loading'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import arrival from '../../game/scenes/prologue-arrival.qs'
import { createDemoUiSession } from '../../game/ui/session'
import { projectDemoNativeView } from './presentation'

export type DemoNativeSession = Awaited<ReturnType<typeof createDemoNativeSession>>
export async function createDemoNativeSession() {
  QuaEngine.resetInstance()
  const loading = new AssetLoadingPlugin()
  const runtime = await createDemoEngineRuntime({
    plugins: [loading],
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
  const openingAssetHints = collectUpcomingAssetHints(await arrival())

  const ui = await createDemoUiSession(runtime)
  let destroyed = false
  let startupError: string | undefined
  // Do not await GPU work in bootstrap: the host must return to its frame loop
  // to render the loading scene and service the preparation request.
  const startup = loading.prepareRenderer('明天，请再一次呼唤我', [
    { assetType: 'images', assetName: 'ui/title-menu-background.webp' },
  ]).catch((error) => { if (!destroyed) startupError = String(error) })
  const pipeline = runtime.engine.getPipeline()
  return {
    connectPipelineBridge(bridge: NativeJscPipelineBridge) {
      const projected: NativeJscPipelineBridge = {
        emit(event, payload) {
          const record = payload as Record<string, unknown> | undefined
          bridge.emit(event, event === LogicToRenderEvents.VIEW_UPDATE && record?.view
            ? { ...record, view: projectDemoNativeView(record.view as NativeRendererEngineViewProjection) }
            : payload)
        },
      }
      const dispose = installNativeJscPipelineBridge(projected, pipeline, {
        initialView: runtime.engine.getViewState(),
        assetPreload: { resolveCharacter: hint => resolveCharacterRef(hint.name).getSpriteAssets(hint) },
      })
      void pipeline.emit('assets/preload', { hints: openingAssetHints })
      const listeners = ['app/quit', ...(runtime.editorPreview ? ['editor/preview/response', 'editor/preview/error'] : [])].map((event) => {
        const handler = (context: { event: { payload: unknown } }) => bridge.emit(event, context.event.payload)
        pipeline.on(event, handler)
        return () => pipeline.off(event, handler)
      })
      return () => {
        dispose()
        listeners.forEach(fn => fn())
      }
    },
    async dispatchIntent(intent: NativeRendererIntent) {
      if (intent.type === ASSET_LOADING_RENDERER_PROGRESS) {
        await pipeline.emit(intent.type, parseNativeRendererIntentPayload(intent))
        return
      }
      if (intent.type === 'ui/intent' || (intent.type === 'editor/preview/request' && runtime.editorPreview)) {
        await pipeline.emit(intent.type, parseNativeRendererIntentPayload(intent))
        return
      }
      const record = parseNativeRendererIntentPayload(intent) as Record<string, unknown> | undefined
      if (intent.type === RenderToLogicEvents.USER_INPUT_COMMAND && record?.command === 'advance' && record.pressed !== false) {
        await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, { source: record.source || 'native' })
        return
      }
      await emitNativeRendererIntentToPipeline(pipeline, intent)
    },
    getInteractionDiagnostics: () => ({ ...ui.getInteractionDiagnostics(), ...(loading.getProjection()?.visible ? { screen: 'loading' } : {}), ...(startupError ? { error: startupError } : {}) }),
    async destroy() {
      destroyed = true
      ui.dispose()
      runtime.editorPreview?.dispose()
      clearCharacterRuntime()
      await runtime.engine.destroy()
      await startup
      QuaEngine.resetInstance()
    },
  }
}
