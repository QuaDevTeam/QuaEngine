import type { SceneHostBoxStyle, SceneHostNode } from '@quajs/scene-host'
import type { SceneRendererPluginContext } from '../types'
import { clientPointToStageLogical, RenderToLogicEvents, viewAllowsDialogueChrome } from '@quajs/render-core'
import { renderSceneChoices } from '../projection'
import { defineSceneRendererPlugin } from './core'
import { createSceneProjectionTask } from './projection-task'
import { INTERACTIVE_CONTROL_METADATA_KEYS } from './projection-utils'

export function createChoicesSceneRendererPlugin(options: { render?: typeof renderSceneChoices } = {}) {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/choices',
    setup(context) {
      let hovered: SceneHostNode | undefined
      const paint = (node: SceneHostNode, active: boolean) => {
        const metadata = context.scene.host.nodes.getNodeMetadata?.(node)
        const styles = metadata?.choiceStyles as { normal?: SceneHostBoxStyle, hover?: SceneHostBoxStyle } | undefined
        if (styles?.normal)
          context.scene.host.nodes.setNodeBoxStyle?.(node, { ...styles.normal, ...(active ? styles.hover : {}) })
      }
      const clearHover = () => {
        if (hovered)
          paint(hovered, false)
        hovered = undefined
      }
      const project = createSceneProjectionTask(context, 'choices', async (scene) => {
        hovered = undefined
        await (options.render || renderSceneChoices)(scene)
      })
      const sync = () => {
        void project()
      }
      context.addDisposer(context.scene.registerAnimationSync(sync))
      context.addDisposer(context.scene.host.input.onInput(async (event) => {
        if (event.kind === 'focus' && event.phase === 'blur')
          clearHover()
        if (event.kind !== 'pointer')
          return
        if (!viewAllowsDialogueChrome(context.getViewState())) {
          clearHover()
          return
        }
        const point = clientPointToStageLogical(context.scene.getStageLayout(), { clientX: event.x ?? 0, clientY: event.y ?? 0 })
        const hit = point.insideStage ? context.scene.host.nodes.hitTest?.(context.scene.getRootNode(), point, { metadataKeys: INTERACTIVE_CONTROL_METADATA_KEYS }) : undefined
        const next = hit?.metadata?.choiceId && hit.metadata.enabled !== false ? hit.node : undefined
        if (hovered?.id !== next?.id) {
          clearHover()
          hovered = next
          if (next)
            paint(next, true)
        }
        if (event.phase !== 'down')
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

export const choicesSceneRendererPlugin = createChoicesSceneRendererPlugin()

function resolveChoiceIdFromHitTest(
  context: SceneRendererPluginContext,
  event: { x?: number, y?: number, targetNode?: unknown },
): string | undefined {
  const targetNode = event.targetNode
  if (targetNode) {
    const metadata = context.scene.host.nodes.getNodeMetadata?.(targetNode as Parameters<typeof context.scene.host.nodes.getNodeMetadata>[0])
    const choiceId = metadata?.choiceId
    const enabled = metadata?.enabled
    return typeof choiceId === 'string' && enabled !== false ? choiceId : undefined
  }
  const point = clientPointToStageLogical(context.scene.getStageLayout(), {
    clientX: event.x ?? 0,
    clientY: event.y ?? 0,
  })
  if (!point.insideStage)
    return undefined
  const hit = context.scene.host.nodes.hitTest?.(context.scene.getRootNode(), point, { metadataKeys: INTERACTIVE_CONTROL_METADATA_KEYS })
  const choiceId = hit?.metadata?.choiceId
  const enabled = hit?.metadata?.enabled
  return typeof choiceId === 'string' && enabled !== false ? choiceId : undefined
}
