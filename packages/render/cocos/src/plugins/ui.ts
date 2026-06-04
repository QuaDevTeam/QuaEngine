import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, LogicToRenderEvents } from '@quajs/render-core'
import { renderCocosUi } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createUiCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/ui',
    setup(context) {
      const sync = () => {
        void renderCocosUi(context.cocos).catch(error => context.reportError(error, {
          message: 'Cocos UI projection failed.',
          phase: 'renderer-cocos:ui',
          pluginName: '@quajs/renderer-cocos/ui',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        if (event.kind !== 'pointer' || event.phase !== 'down')
          return
        const metadata = resolveUiActionMetadata(context, event)
        if (!metadata)
          return
        await dispatchUiAction(context, metadata)
      }))
      sync()
    },
  })
}

export const uiCocosRendererPlugin = createUiCocosRendererPlugin()

function resolveUiActionMetadata(
  context: CocosRendererPluginContext,
  event: { x?: number, y?: number, targetNode?: unknown, metadata?: Record<string, unknown> },
): Record<string, unknown> | undefined {
  if (typeof event.metadata?.uiAction === 'string')
    return event.metadata
  const targetNode = event.targetNode
  if (targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(targetNode as Parameters<typeof context.cocos.host.nodes.getNodeMetadata>[0])
    return typeof metadata?.uiAction === 'string' ? metadata : undefined
  }
  const point = clientPointToStageLogical(context.cocos.getStageLayout(), {
    clientX: event.x ?? 0,
    clientY: event.y ?? 0,
  })
  const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey: 'uiAction' })
  return typeof hit?.metadata?.uiAction === 'string' ? hit.metadata : undefined
}

async function dispatchUiAction(context: CocosRendererPluginContext, metadata: Record<string, unknown>): Promise<void> {
  const actions = context.cocos.getActions()
  const action = metadata.uiAction
  const elementId = stringValue(metadata.elementId)
  if (action === 'panel') {
    return
  }
  if (action === 'close' && elementId) {
    await actions.requestUiClose(elementId)
    return
  }
  if (action === 'open' && elementId) {
    await actions.requestUiOpen(elementId, isRecord(metadata.config) ? metadata.config : undefined)
    if (metadata.closeCurrent === true && typeof metadata.currentElementId === 'string') {
      await actions.requestUiClose(metadata.currentElementId)
    }
    return
  }
  if (action === 'update' && elementId) {
    await actions.requestUiUpdate(elementId, isRecord(metadata.config) ? metadata.config : {})
    return
  }
  if (action === 'save') {
    await actions.requestSave(stringValue(metadata.slotId) || undefined)
    return
  }
  if (action === 'load') {
    await actions.requestLoad(stringValue(metadata.slotId) || undefined)
    return
  }
  if (action === 'flow') {
    await dispatchFlowAction(context, metadata)
    return
  }
  if (action === 'pluginEvent') {
    const eventType = stringValue(metadata.eventType)
    if (eventType) {
      await actions.requestPluginEvent(eventType, metadata.eventPayload ?? {})
    }
  }
}

async function dispatchFlowAction(context: CocosRendererPluginContext, metadata: Record<string, unknown>): Promise<void> {
  const actions = context.cocos.getActions()
  const source = stringValue(metadata.source, 'cocos:ui')
  switch (stringValue(metadata.flowAction).replace(/[_-]/g, '').toLowerCase()) {
    case 'auto':
    case 'startauto':
      await actions.startAuto(source)
      break
    case 'stopauto':
      await actions.stopAuto(source)
      break
    case 'skip':
    case 'startskip':
      await actions.startSkip(source)
      break
    case 'stopskip':
      await actions.stopSkip(source)
      break
    case 'fastforward':
    case 'startfastforward':
      await actions.startFastForward(source)
      break
    case 'stopfastforward':
      await actions.stopFastForward(source)
      break
  }
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
