import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, RenderToLogicEvents, viewAllowsDialogueChrome } from '@quajs/render-core'
import { renderCocosChoices } from '../projection'
import { defineCocosRendererPlugin } from './core'
import { createCocosProjectionTask } from './projection-task'
import { INTERACTIVE_CONTROL_METADATA_KEYS } from './projection-utils'

export function createChoicesCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/choices',
    setup(context) {
      const project = createCocosProjectionTask(context, 'choices', cocos => renderCocosChoices(cocos))
      const sync = () => {
        void project()
      }
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        if (event.kind !== 'pointer' || event.phase !== 'down')
          return
        if (!viewAllowsDialogueChrome(context.getViewState()))
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
  if (!point.insideStage)
    return undefined
  const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKeys: INTERACTIVE_CONTROL_METADATA_KEYS })
  const choiceId = hit?.metadata?.choiceId
  const enabled = hit?.metadata?.enabled
  return typeof choiceId === 'string' && enabled !== false ? choiceId : undefined
}
