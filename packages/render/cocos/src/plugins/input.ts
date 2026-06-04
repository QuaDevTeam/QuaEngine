import type { CocosHostInputEvent } from '@quajs/cocos-host'
import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, RenderToLogicEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'

export interface InputCocosRendererPluginOptions {
  pointerAdvance?: boolean
}

export function createInputCocosRendererPlugin(options: InputCocosRendererPluginOptions = {}) {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/input',
    setup(context) {
      const pointerAdvance = options.pointerAdvance !== false
      context.addDisposer(context.cocos.host.input.onInput(event => handleInputEvent(context, event, pointerAdvance)))
    },
  })
}

export const inputCocosRendererPlugin = createInputCocosRendererPlugin()

const INTERACTIVE_CONTROL_METADATA_KEYS = [
  'choiceId',
  'settingsScope',
  'backlogEntryId',
  'galleryEntryId',
  'achievementId',
  'elementId',
] as const

async function handleInputEvent(
  context: CocosRendererPluginContext,
  event: CocosHostInputEvent,
  pointerAdvance: boolean,
): Promise<void> {
  if (event.kind === 'pointer' && event.phase === 'down') {
    const point = clientPointToStageLogical(context.cocos.getStageLayout(), {
      clientX: event.x ?? 0,
      clientY: event.y ?? 0,
    })
    await context.emitRenderToLogic(RenderToLogicEvents.USER_CLICK, {
      x: point.x,
      y: point.y,
      target: typeof event.metadata?.target === 'string' ? event.metadata.target : undefined,
    })
    if (pointerAdvance && !isInteractiveControlPointer(context, event, point)) {
      await context.cocos.getActions().advance('cocos:pointer')
    }
    return
  }

  if (event.kind === 'keyboard' && event.phase === 'down') {
    const key = event.key || event.code || ''
    await context.emitRenderToLogic(RenderToLogicEvents.USER_KEY_PRESS, { key, code: event.code })
    if (key === 'Enter' || key === ' ' || key === 'Space') {
      await context.cocos.getActions().advance('cocos:keyboard')
    }
  }
}

function isInteractiveControlPointer(
  context: CocosRendererPluginContext,
  event: CocosHostInputEvent,
  point: { x: number, y: number },
): boolean {
  if (hasInteractiveControlMetadata(event.metadata))
    return true

  if (event.targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(event.targetNode)
    if (hasInteractiveControlMetadata(metadata))
      return true
  }

  return INTERACTIVE_CONTROL_METADATA_KEYS.some((metadataKey) => {
    const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey })
    return hasInteractiveControlMetadata(hit?.metadata)
  })
}

function hasInteractiveControlMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(metadata && INTERACTIVE_CONTROL_METADATA_KEYS.some(key => metadata[key] !== undefined))
}
