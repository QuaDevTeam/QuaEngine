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
      let page = 0
      const sync = () => renderBacklogLayer(context, page)
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
        else if (action === 'page') {
          page = Math.max(0, page + (Number(metadata.backlogPageDelta) || 0))
          sync()
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

function renderBacklogLayer(context: CocosRendererPluginContext, requestedPage: number): void {
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

  const page = pageItems(projection.entries, requestedPage, 8)
  page.items.forEach((entry, index) => renderBacklogEntry(context, panel, entry, page.page * 8 + index, index, safeArea.x + 28, safeArea.y + 92, safeArea.width - 56))
  renderBacklogButton(context, panel, 'backlog:page:prev', 'Prev', {
    x: safeArea.x + 28,
    y: safeArea.y + 92 + 8 * 84,
    width: 96,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'page', backlogPageDelta: -1 },
  })
  renderBacklogButton(context, panel, 'backlog:page:next', 'Next', {
    x: safeArea.x + 136,
    y: safeArea.y + 92 + 8 * 84,
    width: 96,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'page', backlogPageDelta: 1 },
  })
  const pageLabel = context.cocos.host.nodes.createNode('backlog-page-label', { parent: panel, name: 'backlog:page:label' })
  context.cocos.host.nodes.setNodeText(pageLabel, `${page.page + 1}/${page.pageCount}`, { fontSize: 20, color: '#d8d8d8' })
  context.cocos.host.nodes.setNodeTransform(pageLabel, { x: safeArea.x + 244, y: safeArea.y + 92 + 8 * 84, width: 96, height: 44, zIndex: 20 })
}

function renderBacklogEntry(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  entry: BacklogEntry,
  absoluteIndex: number,
  index: number,
  x: number,
  startY: number,
  width: number,
): void {
  const y = startY + index * 84
  const node = context.cocos.host.nodes.createNode('backlog-entry', { parent, name: `backlog:${entry.id}` })
  const label = [
    String(absoluteIndex + 1).padStart(2, '0'),
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

interface PageResult<T> {
  items: readonly T[]
  page: number
  pageCount: number
}

function pageItems<T>(items: readonly T[], requestedPage: number, pageSize: number): PageResult<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(pageCount - 1, Math.max(0, requestedPage))
  return {
    items: items.slice(page * pageSize, page * pageSize + pageSize),
    page,
    pageCount,
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
