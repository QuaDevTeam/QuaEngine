import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { renderCocosChoices } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createChoicesCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/choices',
    setup(context) {
      const sync = () => {
        void renderCocosChoices(context.cocos).catch(error => context.reportError(error, {
          message: 'Cocos choices projection failed.',
          phase: 'renderer-cocos:choices',
          pluginName: '@quajs/renderer-cocos/choices',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        if (event.kind !== 'pointer' || event.phase !== 'down')
          return
        const choiceId = typeof event.metadata?.choiceId === 'string'
          ? event.metadata.choiceId
          : resolveChoiceIdFromHitTest(context, event)
        if (choiceId) {
          await context.emitRenderToLogic(RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId })
        }
      }))
      sync()
    },
  })
}

export const choicesCocosRendererPlugin = createChoicesCocosRendererPlugin()

function resolveChoiceIdFromHitTest(
  context: CocosRendererPluginContext,
  event: { x?: number, y?: number, targetNode?: unknown },
): string | undefined {
  const targetNode = event.targetNode
  if (targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(targetNode as Parameters<typeof context.cocos.host.nodes.getNodeMetadata>[0])
    const choiceId = metadata?.choiceId
    const enabled = metadata?.enabled
    return typeof choiceId === 'string' && enabled !== false ? choiceId : undefined
  }
  const point = clientPointToStageLogical(context.cocos.getStageLayout(), {
    clientX: event.x ?? 0,
    clientY: event.y ?? 0,
  })
  const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey: 'choiceId' })
  const choiceId = hit?.metadata?.choiceId
  const enabled = hit?.metadata?.enabled
  return typeof choiceId === 'string' && enabled !== false ? choiceId : undefined
}
