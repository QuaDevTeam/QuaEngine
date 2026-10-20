import type { BacklogEntry, BacklogProjection, BacklogUiProjection } from '@quajs/plugin-backlog/contracts'
import type { ViewOverlayStackPlacement } from '@quajs/render-core'
import type { SceneHostNode } from '@quajs/scene-host'
import type { SceneRendererPluginContext } from '../types'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { DEFAULT_UI_OVERLAY_Z_INDEXES } from '@quajs/render-core'
import { resolveSceneOverlayPlacement, resolveSceneOverlayZIndex } from '../overlay-placement'
import { defineSceneRendererPlugin } from './core'
import { subscribeSceneProjection } from './projection-task'
import { resolveInputMetadataAny, stringValue } from './projection-utils'

export function createBacklogSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/backlog',
    setup(context) {
      let page = 0
      const sync = () => renderBacklogLayer(context, page)
      context.addDisposer(subscribeSceneProjection(context, sync))
      context.addDisposer(context.scene.host.input.onInput(async (event) => {
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

export const backlogSceneRendererPlugin = createBacklogSceneRendererPlugin()

function renderBacklogLayer(context: SceneRendererPluginContext, requestedPage: number): void {
  const projection = context.getViewState().plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined
  const placement = backlogUiPlacement(projection?.ui)
  const layer = context.scene.getLayerNode('backlog', 'backlog-layer', resolveSceneOverlayZIndex(placement, {
    overlayStack: 'overlay',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.backlog,
  }))
  context.scene.host.nodes.clearChildren(layer)
  const overlayPlacement = resolveSceneOverlayPlacement(placement, {
    overlayStack: 'overlay',
    zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.backlog,
  })
  context.scene.host.nodes.setNodeMetadata?.(layer, {
    plugin: 'backlog',
    overlayPlacement,
    visible: projection?.visible === true,
    projection,
    uiScene: projection?.ui?.scene,
  })
  if (!projection?.visible)
    return

  const safeArea = context.scene.getStageLayout().safeArea
  const panel = context.scene.host.nodes.createNode('backlog-panel', { parent: layer, name: 'backlog:panel' })
  context.scene.host.nodes.setNodeTransform(panel, {
    x: safeArea.x,
    y: safeArea.y,
    width: safeArea.width,
    height: safeArea.height,
    zIndex: 0,
  })
  context.scene.host.nodes.setNodeControl?.(panel, { kind: 'panel', label: 'Backlog' })
  context.scene.host.nodes.setNodeMetadata?.(panel, {
    plugin: 'backlog',
    backlogAction: 'panel',
    entryCount: projection.entries.length,
    retentionScope: projection.retention.scope,
    retentionMaxEntries: projection.retention.maxEntries,
    uiScene: projection.ui?.scene,
  })

  const title = context.scene.host.nodes.createNode('backlog-title', { parent: panel, name: 'backlog:title' })
  context.scene.host.nodes.setNodeText(title, 'Backlog', { fontSize: 32, color: '#ffffff' })
  context.scene.host.nodes.setNodeTransform(title, { x: 28, y: 24, width: safeArea.width - 180, height: 48, zIndex: 1 })
  renderBacklogButton(context, panel, 'backlog:close', 'Close', {
    x: safeArea.width - 140,
    y: 24,
    width: 112,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'close' },
  })

  const page = pageItems(projection.entries, requestedPage, 8)
  if (projection.entries.length === 0) {
    const empty = context.scene.host.nodes.createNode('backlog-empty', { parent: panel, name: 'backlog:empty' })
    context.scene.host.nodes.setNodeText(empty, 'No recorded lines yet.', { fontSize: 24, color: '#d8d8d8' })
    context.scene.host.nodes.setNodeTransform(empty, { x: 28, y: 110, width: safeArea.width - 56, height: 56, zIndex: 10 })
    context.scene.host.nodes.setNodeMetadata?.(empty, { plugin: 'backlog', empty: true })
  }
  page.items.forEach((entry, index) => renderBacklogEntry(context, panel, entry, page.page * 8 + index, index, 28, 110, safeArea.width - 56))
  renderBacklogButton(context, panel, 'backlog:page:prev', 'Prev', {
    x: 28,
    y: 110 + 8 * 84,
    width: 96,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'page', backlogPageDelta: -1 },
  })
  renderBacklogButton(context, panel, 'backlog:page:next', 'Next', {
    x: 136,
    y: 110 + 8 * 84,
    width: 96,
    height: 44,
    metadata: { plugin: 'backlog', backlogAction: 'page', backlogPageDelta: 1 },
  })
  const pageLabel = context.scene.host.nodes.createNode('backlog-page-label', { parent: panel, name: 'backlog:page:label' })
  context.scene.host.nodes.setNodeText(pageLabel, `${page.page + 1}/${page.pageCount}`, { fontSize: 20, color: '#d8d8d8' })
  context.scene.host.nodes.setNodeTransform(pageLabel, { x: 244, y: 110 + 8 * 84, width: 96, height: 44, zIndex: 20 })
}

function renderBacklogEntry(
  context: SceneRendererPluginContext,
  parent: SceneHostNode,
  entry: BacklogEntry,
  absoluteIndex: number,
  index: number,
  x: number,
  startY: number,
  width: number,
): void {
  const y = startY + index * 84
  const node = context.scene.host.nodes.createNode('backlog-entry', { parent, name: `backlog:${entry.id}` })
  const indexText = String(absoluteIndex + 1).padStart(2, '0')
  const timeText = formatBacklogGameTime(entry.gameTimeMs)
  const contentText = entry.kind === 'choice' ? choiceText(entry) : entry.text || ''
  const label = [indexText, timeText, entry.speaker, contentText].filter(Boolean).join('  ')
  context.scene.host.nodes.setNodeText(node, label, { fontSize: 22, color: entry.rewindable ? '#ffffff' : '#b8b8b8' })
  context.scene.host.nodes.setNodeControl?.(node, {
    kind: 'button',
    label,
    disabled: !entry.rewindable,
  })
  context.scene.host.nodes.setNodeTransform(node, { x, y, width: entry.voice ? width - 116 : width, height: 64, zIndex: index + 2 })
  context.scene.host.nodes.setNodeMetadata?.(node, {
    plugin: 'backlog',
    backlogEntryId: entry.id,
    backlogKind: entry.kind,
    backlogIndex: absoluteIndex,
    gameTimeMs: entry.gameTimeMs,
    recordedAt: entry.recordedAt,
    tags: entry.tags,
    rewindable: entry.rewindable,
    voiceReplay: entry.voiceReplay,
  })
  const meta = context.scene.host.nodes.createNode('backlog-entry-meta', { parent: node, name: `backlog:${entry.id}:meta` })
  context.scene.host.nodes.setNodeText(meta, [indexText, timeText].filter(Boolean).join(' / '), { fontSize: 16, color: '#d8d8d8' })
  context.scene.host.nodes.setNodeTransform(meta, { x: 12, y: 6, width: 220, height: 20, zIndex: index + 3 })
  const content = context.scene.host.nodes.createNode('backlog-entry-content', { parent: node, name: `backlog:${entry.id}:content` })
  context.scene.host.nodes.setNodeText(content, [entry.speaker, contentText].filter(Boolean).join(': '), { fontSize: 20, color: entry.rewindable ? '#ffffff' : '#b8b8b8' })
  context.scene.host.nodes.setNodeTransform(content, { x: 12, y: 28, width: Math.max(0, (entry.voice ? width - 116 : width) - 24), height: 30, zIndex: index + 3 })
  if (entry.tags?.length) {
    const tags = context.scene.host.nodes.createNode('backlog-entry-tags', { parent: node, name: `backlog:${entry.id}:tags` })
    context.scene.host.nodes.setNodeText(tags, entry.tags.join(', '), { fontSize: 14, color: '#d8d8d8' })
    context.scene.host.nodes.setNodeTransform(tags, { x: 240, y: 6, width: Math.max(0, width - 360), height: 20, zIndex: index + 3 })
  }
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

function backlogUiPlacement(ui: Readonly<BacklogUiProjection> | undefined): ViewOverlayStackPlacement {
  return {
    overlayStack: ui?.overlayStack ?? ui?.scene?.overlay?.overlayStack,
    stackPriority: ui?.stackPriority ?? ui?.scene?.overlay?.stackPriority,
    zIndex: ui?.zIndex ?? ui?.scene?.overlay?.zIndex,
  }
}

function choiceText(entry: BacklogEntry): string {
  return entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
}

function formatBacklogGameTime(gameTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(gameTimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
  context: SceneRendererPluginContext,
  parent: SceneHostNode,
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
  const node = context.scene.host.nodes.createNode('backlog-button', { parent, name })
  context.scene.host.nodes.setNodeText(node, label, { fontSize: 22, color: '#ffffff' })
  context.scene.host.nodes.setNodeControl?.(node, { kind: 'button', label, disabled: options.disabled })
  context.scene.host.nodes.setNodeTransform(node, { x: options.x, y: options.y, width: options.width, height: options.height, zIndex: 20 })
  context.scene.host.nodes.setNodeMetadata?.(node, options.metadata)
}
