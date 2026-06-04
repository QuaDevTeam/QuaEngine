import type { CocosHostInputEvent } from '@quajs/cocos-host'
import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, LogicToRenderEvents } from '@quajs/render-core'

export function syncProjectionLayer(
  context: CocosRendererPluginContext,
  options: {
    pluginName: string
    projectionKey: string
    layerId: string
    layerKind: string
    order: number
    itemKey?: string
    itemKind?: string
    itemLabel?: (item: Record<string, unknown>, index: number) => string
    itemMetadata?: (item: Record<string, unknown>, index: number) => Record<string, unknown>
  },
): void {
  const sync = () => {
    const projection = readPluginProjection(context, options.projectionKey)
    const layer = context.cocos.getLayerNode(options.layerId, options.layerKind, options.order)
    context.cocos.host.nodes.clearChildren(layer)
    context.cocos.host.nodes.setNodeMetadata?.(layer, {
      plugin: options.projectionKey,
      projection,
    })
    const items = options.itemKey ? arrayRecords(projection?.[options.itemKey]) : []
    const safeArea = context.cocos.getStageLayout().safeArea
    items.forEach((item, index) => {
      const node = context.cocos.host.nodes.createNode(options.itemKind || `${options.projectionKey}-item`, {
        parent: layer,
        name: String(item.id || item.achievementId || item.entryId || item.scope || index),
      })
      context.cocos.host.nodes.setNodeText(node, options.itemLabel?.(item, index) || defaultItemLabel(item, index), { fontSize: 24 })
      context.cocos.host.nodes.setNodeTransform(node, {
        x: safeArea.x,
        y: safeArea.y + index * 56,
        width: safeArea.width,
        height: 48,
        zIndex: index,
      })
      context.cocos.host.nodes.setNodeMetadata?.(node, {
        plugin: options.projectionKey,
        item,
        ...(options.itemMetadata?.(item, index) || {}),
      })
    })
  }
  context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
  sync()
}

export function bindProjectionIntent(
  context: CocosRendererPluginContext,
  options: {
    pluginKey: string
    metadataKey: string
    eventType: string
    payload: (metadata: Record<string, unknown>) => Record<string, unknown> | undefined
  },
): void {
  context.addDisposer(context.cocos.host.input.onInput(async (event) => {
    const metadata = resolveInputMetadata(context, event, options.metadataKey)
    if (!metadata || metadata.plugin !== options.pluginKey)
      return
    const payload = options.payload(metadata)
    if (payload) {
      await context.getPipeline().emit(options.eventType, payload)
    }
  }))
}

export function readPluginProjection(context: CocosRendererPluginContext, key: string): Record<string, unknown> | undefined {
  const value = context.getViewState().plugins[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]))
      .map(([key, item]) => ({ scope: key, ...item }))
  }
  return []
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function resolveInputMetadata(
  context: CocosRendererPluginContext,
  event: CocosHostInputEvent,
  metadataKey: string,
): Record<string, unknown> | undefined {
  if (event.kind !== 'pointer' || event.phase !== 'down')
    return undefined
  if (event.targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(event.targetNode)
    if (metadata?.[metadataKey] !== undefined)
      return metadata
  }
  const point = clientPointToStageLogical(context.cocos.getStageLayout(), {
    clientX: event.x ?? 0,
    clientY: event.y ?? 0,
  })
  return context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey })?.metadata
}

function defaultItemLabel(item: Record<string, unknown>, index: number): string {
  return stringValue(item.title)
    || stringValue(item.label)
    || stringValue(item.text)
    || stringValue(item.id)
    || String(index + 1)
}
