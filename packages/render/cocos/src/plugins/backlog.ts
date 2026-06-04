import type { CocosHostNode } from '@quajs/cocos-host'
import type { BacklogEntry, BacklogProjection } from '@quajs/plugin-backlog/contracts'
import type { CocosRendererPluginContext } from '../types'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

export function createBacklogCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/backlog',
    setup(context) {
      const sync = () => renderBacklogLayer(context)
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        const metadata = resolveInputMetadataAny(context, event, [
          'backlogEntryId',
          'backlogAction',
        ])
        if (!metadata || (metadata.plugin !== undefined && metadata.plugin !== 'backlog'))
          return
        const action = stringValue(metadata.backlogAction)
        const entryId = stringValue(metadata.backlogEntryId)
        if (action === 'close') {
          await context.getPipeline().emit(BacklogRenderToLogicEvents.CLOSE_REQUEST, {})
        }
        else if (action === 'replayVoice' && entryId && metadata.voiceReplay !== false) {
          await context.getPipeline().emit(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId })
        }
        else if (entryId && metadata.rewindable !== false) {
          await context.getPipeline().emit(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId })
        }
      }))
      sync()
    },
  })
}

export const backlogCocosRendererPlugin = createBacklogCocosRendererPlugin()

function renderBacklogLayer(context: CocosRendererPluginContext): void {
  const projection = context.getViewState().plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined
  const layer = context.cocos.getLayerNode('backlog', 'backlog-layer', 110)
  context.cocos.host.nodes.clearChildren(layer)
  context.cocos.host.nodes.setNodeMetadata?.(layer, {
    plugin: 'backlog',
    visible: projection?.visible === true,
    projection,
  })
  if (!projection?.visible)
    return

  const safeArea = context.cocos.getStageLayout().safeArea
  const panel = context.cocos.host.nodes.createNode('backlog-panel', { parent: layer, name: 'backlog:panel' })
  context.cocos.host.nodes.setNodeTransform(panel, {
    x: safeArea.x,
    y: safeArea.y,
    width: safeArea.width,
    height: safeArea.height,
    zIndex: 0,
  })
  context.cocos.host.nodes.setNodeControl?.(panel, { kind: 'panel', label: 'Backlog' })
  context.cocos.host.nodes.setNodeMetadata?.(panel, { plugin: 'backlog', backlogAction: 'panel' })

  const title = context.cocos.host.nodes.createNode('backlog-title', { parent: panel, name: 'backlog:title' })
  context.cocos.host.nodes.setNodeText(title, `Backlog - ${projection.entries.length} entries`, { fontSize: 32, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, { x: safeArea.x + 28, y: safeArea.y + 24, width: safeArea.width - 180, height: 48, zIndex: 1 })
  renderBacklogButton(context, panel, 'backlog:close', 'Close', {
    x: safeArea.x + safeArea.width - 140,
    y: safeArea.y + 24,
    width: 112,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'close' },
  })

  projection.entries.forEach((entry, index) => renderBacklogEntry(context, panel, entry, index, safeArea.x + 28, safeArea.y + 92, safeArea.width - 56))
}

function renderBacklogEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: BacklogEntry,
  index: number,
  x: number,
  startY: number,
  width: number,
): void {
  const y = startY + index * 84
  const node = context.cocos.host.nodes.createNode('backlog-entry', { parent, name: `backlog:${entry.id}` })
  const label = [
    String(index + 1).padStart(2, '0'),
    entry.speaker,
    entry.kind === 'choice' ? entry.choices?.map(choice => choice.text).join(' / ') : entry.text,
  ].filter(Boolean).join('  ')
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 22, color: entry.rewindable ? '#ffffff' : '#b8b8b8' })
  context.cocos.host.nodes.setNodeControl?.(node, {
    kind: 'button',
    label,
    disabled: !entry.rewindable,
  })
  context.cocos.host.nodes.setNodeTransform(node, { x, y, width: entry.voice ? width - 116 : width, height: 64, zIndex: index + 2 })
  context.cocos.host.nodes.setNodeMetadata?.(node, {
    plugin: 'backlog',
    backlogEntryId: entry.id,
    rewindable: entry.rewindable,
    voiceReplay: entry.voiceReplay,
  })
  if (entry.voice) {
    renderBacklogButton(context, parent, `backlog:${entry.id}:voice`, 'Voice', {
      x: x + width - 104,
      y,
      width: 96,
      height: 64,
      disabled: !entry.voiceReplay,
      metadata: {
        plugin: 'backlog',
        backlogAction: 'replayVoice',
        backlogEntryId: entry.id,
        voiceReplay: entry.voiceReplay,
      },
    })
  }
}

function renderBacklogButton(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  name: string,
  label: string,
  options: {
    x: number
    y: number
    width: number
    height: number
    disabled?: boolean
    metadata: Record<string, unknown>
  },
): void {
  const node = context.cocos.host.nodes.createNode('backlog-button', { parent, name })
  context.cocos.host.nodes.setNodeText(node, label, { fontSize: 22, color: '#ffffff' })
  context.cocos.host.nodes.setNodeControl?.(node, { kind: 'button', label, disabled: options.disabled })
  context.cocos.host.nodes.setNodeTransform(node, { x: options.x, y: options.y, width: options.width, height: options.height, zIndex: 20 })
  context.cocos.host.nodes.setNodeMetadata?.(node, options.metadata)
}
