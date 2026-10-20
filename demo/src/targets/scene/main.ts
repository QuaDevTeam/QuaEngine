import type { AssetRuntimeAdapter, QuaAssets } from '@quajs/assets'
import type { EngineConfig } from '@quajs/engine'
import type { renderSceneChoices, renderSceneDialogue } from '@quajs/renderer-scene'
import type { SceneHost } from '@quajs/scene-host'
import { clearCharacterRuntime, configureCharacterRuntime } from '@quajs/character'
import { projectChoices, projectDialogue, richTextToPlainText, viewAllowsDialogueChrome } from '@quajs/render-core'
import { createDemoMediaReview } from '../../game/media-review'
import { createDemoEngineRuntime } from '../../game/runtime-shared'
import { DEMO_UI_FEATURE_SURFACES } from '../../game/ui/features'
import { createDemoUiSession } from '../../game/ui/session'
import { DEMO_APP_SURFACE_KEY } from '../../game/ui/surface'

const renderDialogue: typeof renderSceneDialogue = async (context, options = {}) => {
  const host = context.host.nodes
  const layer = context.getLayerNode('dialogue', 'dialogue-layer', 50)
  host.clearChildren(layer)
  if (!viewAllowsDialogueChrome(context.getViewState()))
    return
  const dialogue = options.typewriter?.dialogue || projectDialogue(context.getViewState().dialogue, context.getViewState().animations, context.host.runtime.now())
  if (!dialogue.visible)
    return
  const box = host.createNode('dialogue-box', { parent: layer, name: 'demo-dialogue-box' })
  const text = richTextToPlainText(dialogue.text)
  const speaker = dialogue.speaker ?? dialogue.characterName
  const safe = context.getStageLayout().safeArea
  const width = safe.width * 0.9
  const textWidth = width - 106
  const bodyStyle = { fontSize: 30, lineHeight: 54, letterSpacing: 1.05, align: 'left' as const, fontFamily: 'Noto Sans', color: '#29453f', verticalAlign: 'center' as const }
  const measured = host.measureText?.(text, bodyStyle, textWidth)
  const lineCount = Math.max(1, measured ? Math.round(measured.height / 54) : Math.ceil(text.length / 49))
  const height = Math.max(250, 110 + (speaker ? 50 : 0) + lineCount * 54)
  host.setNodeTransform(box, { x: safe.x + safe.width * 0.05, y: safe.y + safe.height * 0.95 - height, width, height })
  host.setNodeBoxStyle?.(box, { backgroundColor: '#f5f3ebf5', borderWidth: 1, borderColor: '#c7d2c5', borderTopWidth: 3, borderTopColor: '#42796e', borderRadius: 3, boxShadow: { color: 'rgba(16,46,41,0.15)', offsetX: 0, offsetY: 18, blurRadius: 64, spreadRadius: 0, inset: false } })
  const stripe = host.createNode('box', { parent: box })
  host.setNodeTransform(stripe, { x: 0, y: 0, width, height: 3 })
  host.setNodeColor?.(stripe, '#42796e')
  let top = 33
  if (speaker) {
    const label = host.createNode('text', { parent: box, name: 'demo-dialogue-speaker' })
    host.setNodeTransform(label, { x: 53, y: top, width: textWidth, height: 36 })
    host.setNodeText(label, richTextToPlainText(speaker), { fontSize: 25, lineHeight: 36, align: 'left', letterSpacing: 3, fontWeight: 600, verticalAlign: 'center', fontFamily: 'Noto Sans', color: '#42796e' })
    top += 50
  }
  const body = host.createNode('text', { parent: box, name: 'demo-dialogue-text' })
  host.setNodeTransform(body, { x: 53, y: top, width: textWidth, height: lineCount * 54 })
  host.setNodeText(body, text, bodyStyle)
  const rule = host.createNode('box', { parent: box })
  host.setNodeTransform(rule, { x: 52, y: height - 65, width: width - 104, height: 1 })
  host.setNodeColor?.(rule, '#c7d2c5')
}

const renderChoices: typeof renderSceneChoices = async (context) => {
  const host = context.host.nodes
  const layer = context.getLayerNode('choices', 'choice-layer', 60)
  host.clearChildren(layer)
  if (!viewAllowsDialogueChrome(context.getViewState()))
    return
  const projection = projectChoices(context.getViewState().choices, context.getViewState().animations, context.host.runtime.now())
  const choices = projection.choices
  choices.forEach((choice, index) => {
    const button = host.createNode('button', { parent: layer, name: `choice-${choice.id}` })
    host.setNodeTransform(button, { x: 440, y: 746 - (choices.length * 104.2 - 14) + index * 104.2, width: 1040, height: 90.2 })
    const normal = { backgroundColor: '#f5f3eb', borderWidth: 1, borderColor: '#c7d2c5', borderLeftWidth: 4, borderLeftColor: '#42796e', borderRadius: 3 }
    host.setNodeBoxStyle?.(button, normal)
    host.setNodeMetadata?.(button, { choiceId: choice.id, enabled: choice.enabled !== false, choiceStyles: { normal, hover: { backgroundColor: '#e3ebe2', borderColor: '#42796e' } } })
    const text = host.createNode('text', { parent: button })
    host.setNodeTransform(text, { x: 44, y: 23, width: 955, height: 44.2 })
    host.setNodeText(text, richTextToPlainText(choice.text), { fontSize: 26, lineHeight: 44.2, align: 'left', verticalAlign: 'center', color: '#29453f', fontFamily: 'Noto Sans' })
  })
}

/** Business entry receives the active target services from Quack's resolver. */
export async function bootstrap(services: {
  host: SceneHost
  assets: QuaAssets
  adapter: AssetRuntimeAdapter
  store: NonNullable<EngineConfig['store']>['storage']
  project: EngineConfig['project']
  layout?: EngineConfig['layout']
  runtimeModuleLoader: EngineConfig['runtimeModuleLoader']
  trustPolicy: EngineConfig['trustPolicy']
  review?: boolean
}) {
  const { host, assets } = services
  const runtime = await createDemoEngineRuntime({
    systemLocale: 'zh-cn',
    settingsStorage: {
      async loadProfile(id) {
        const text = await host.storage.readText(`settings/${id}.json`)
        return text ? JSON.parse(text) : undefined
      },
      async saveProfile(profile) {
        await host.storage.ensureDir('settings')
        await host.storage.writeText(`settings/${profile.profileId}.json`, JSON.stringify(profile))
      },
      deleteProfile: id => host.storage.delete(`settings/${id}.json`),
    },
    engine: {
      project: services.project,
      layout: services.layout ?? 'landscape',
      assets: { adapter: services.adapter, provider: assets.getProvider(), locale: 'default', enableCache: false },
      store: { storage: services.store },
      runtimeModuleLoader: services.runtimeModuleLoader,
      trustPolicy: services.trustPolicy,
      flowControl: { skipMode: 'read', timings: { autoAdvanceDelayMs: 2000 } },
      dialogue: { typewriter: { enabled: true, charactersPerSecond: 36, revealOnAdvance: true } },
    },
  })
  configureCharacterRuntime({ engine: runtime.engine, waitForAdvance: true })
  const ui = await createDemoUiSession(runtime)
  const mediaReview = services.review ? createDemoMediaReview(runtime) : undefined
  return {
    mediaReview,
    engine: runtime.engine,
    characterBoxSize: { width: 640, height: 1280 },
    features: DEMO_UI_FEATURE_SURFACES,
    surfaceKeys: [DEMO_APP_SURFACE_KEY],
    renderDialogue,
    renderChoices,
    getDiagnostics: ui.getInteractionDiagnostics,
    async destroy() {
      mediaReview?.dispose()
      ui.dispose()
      clearCharacterRuntime()
      await runtime.engine.destroy()
    },
  }
}
