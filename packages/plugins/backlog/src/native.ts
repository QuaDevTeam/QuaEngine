import type { NativeRendererFeatureSurfaceContext, NativeRendererFeatureSurfaceEntry } from '@quajs/engine-native'
import type {
  NativePackageProvenance,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from '@quajs/native-ui-compiler'
import type { BacklogEntry, BacklogProjection } from './contracts'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from './contracts'

export const BACKLOG_NATIVE_RENDERER_ENTRY = '@quajs/plugin-backlog/native' as const
export const BACKLOG_NATIVE_SURFACE_KEY = 'plugin-backlog/native' as const

const BACKLOG_CLOSE_ACTION = 'backlog-close'
const BACKLOG_JUMP_ACTION = 'backlog-jump'
const BACKLOG_REPLAY_VOICE_ACTION = 'backlog-replay-voice'
const MAX_VISIBLE_ENTRIES = 6

export function createBacklogNativeRendererFeature(): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: BACKLOG_PLUGIN_ID,
    createOverlays: createBacklogNativeOverlays,
    intentActions: [
      {
        action: BACKLOG_CLOSE_ACTION,
        event: BacklogRenderToLogicEvents.CLOSE_REQUEST,
        createPayload: () => ({ source: 'native' }),
      },
      {
        action: BACKLOG_JUMP_ACTION,
        event: BacklogRenderToLogicEvents.JUMP_REQUEST,
        createPayload: payload => ({ entryId: requiredIntentString(payload.entryId, 'entryId') }),
      },
      {
        action: BACKLOG_REPLAY_VOICE_ACTION,
        event: BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST,
        createPayload: payload => ({ entryId: requiredIntentString(payload.entryId, 'entryId') }),
      },
    ],
  }
}

function createBacklogNativeOverlays(context: NativeRendererFeatureSurfaceContext) {
  const projection = context.projection as unknown as BacklogProjection & Record<string, unknown>
  if (projection.visible !== true) {
    return undefined
  }

  const overlayProvenance = projectionProvenance(projection)
  return {
    elementId: BACKLOG_PLUGIN_ID,
    visible: true,
    renderMode: 'render-only' as const,
    interactive: true,
    overlayStack: stringValue(projection.ui?.overlayStack) || 'overlay',
    stackPriority: finiteInteger(projection.ui?.stackPriority),
    zIndex: finiteInteger(projection.ui?.zIndex) ?? 50,
    surface: {
      key: BACKLOG_NATIVE_SURFACE_KEY,
      root: createBacklogRoot(context, projection.entries || [], overlayProvenance),
    },
    ...overlayProvenance,
  }
}

function createBacklogRoot(
  context: NativeRendererFeatureSurfaceContext,
  entries: readonly BacklogEntry[],
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const edge = Math.max(28, Math.min(context.safeArea.width, context.logicalHeight) * 0.035)
  const panelBounds = insetRect(context.safeArea, edge, edge)
  const headerHeight = Math.max(64, Math.min(92, panelBounds.height * 0.1))
  const footerGap = Math.max(18, panelBounds.height * 0.025)
  const contentTop = panelBounds.y + headerHeight + footerGap
  const contentBottom = panelBounds.y + panelBounds.height - edge
  const recentEntries = entries.slice(-MAX_VISIBLE_ENTRIES).reverse()
  const entryGap = Math.max(12, panelBounds.height * 0.014)
  const availableHeight = Math.max(0, contentBottom - contentTop)
  const entryHeight = recentEntries.length > 0
    ? Math.max(72, (availableHeight - entryGap * (recentEntries.length - 1)) / recentEntries.length)
    : 0

  const children: NativeUiSurfaceNodeProjection[] = [
    node('backlog-backdrop', 'Backdrop', stageRect(context), {
      intent: uiIntent(BACKLOG_CLOSE_ACTION),
      style: { backgroundColor: '#050608', opacity: 0.84 },
      provenance,
    }),
    node('backlog-panel', 'Panel', panelBounds, {
      style: {
        backgroundColor: '#12151a',
        borderColor: '#5f6773',
        borderRadius: 6,
        borderWidth: 1,
      },
      provenance,
      children: [
        node('backlog-title', 'Text', {
          x: panelBounds.x + edge,
          y: panelBounds.y + edge * 0.5,
          width: panelBounds.width - edge * 2 - 112,
          height: headerHeight - edge * 0.5,
        }, {
          text: 'Backlog',
          style: { color: '#f4f5f7', fontSize: 34, fontWeight: 700 },
          provenance,
        }),
        node('backlog-close', 'Button', {
          x: panelBounds.x + panelBounds.width - edge - 96,
          y: panelBounds.y + edge * 0.5,
          width: 96,
          height: Math.max(48, headerHeight - edge),
        }, {
          text: 'Close',
          intent: uiIntent(BACKLOG_CLOSE_ACTION),
          style: buttonStyle('#2b313a'),
          provenance,
        }),
        ...recentEntries.map((entry, index) => createBacklogEntryNode(
          entry,
          index,
          {
            x: panelBounds.x + edge,
            y: contentTop + index * (entryHeight + entryGap),
            width: panelBounds.width - edge * 2,
            height: entryHeight,
          },
          provenance,
        )),
        ...(recentEntries.length === 0
          ? [node('backlog-empty', 'Text', {
              x: panelBounds.x + edge,
              y: contentTop,
              width: panelBounds.width - edge * 2,
              height: Math.max(80, availableHeight),
            }, {
              text: 'No backlog entries',
              style: { color: '#aeb4bd', fontSize: 24, textAlign: 'center' },
              provenance,
            })]
          : []),
      ],
    }),
  ]

  return node('backlog-root', 'Fragment', stageRect(context), { children, provenance })
}

function createBacklogEntryNode(
  entry: BacklogEntry,
  index: number,
  bounds: NativeUiSurfaceRect,
  inheritedProvenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inheritedProvenance, entryProvenance(entry))
  const controlsWidth = (entry.rewindable ? 106 : 0) + (entry.voiceReplay && entry.voice ? 106 : 0)
    + (entry.rewindable && entry.voiceReplay && entry.voice ? 12 : 0)
  const textRight = bounds.x + bounds.width - Math.max(20, controlsWidth + 24)
  const metadata = [formatGameTime(entry.gameTimeMs), entry.speaker].filter(Boolean).join('  ')
  const body = entry.text || entry.choices?.map(choice => choice.text).filter(Boolean).join(' / ') || ''
  const children: NativeUiSurfaceNodeProjection[] = [
    node(`backlog-entry-${index}-metadata`, 'Text', {
      x: bounds.x + 18,
      y: bounds.y + 10,
      width: Math.max(0, textRight - bounds.x - 18),
      height: Math.max(22, bounds.height * 0.28),
    }, {
      text: metadata,
      style: { color: '#8f98a5', fontSize: 16 },
      provenance,
    }),
    node(`backlog-entry-${index}-body`, 'Text', {
      x: bounds.x + 18,
      y: bounds.y + Math.max(36, bounds.height * 0.32),
      width: Math.max(0, textRight - bounds.x - 18),
      height: Math.max(28, bounds.height * 0.55),
    }, {
      text: body,
      style: { color: '#eef0f3', fontSize: 21, textOverflow: 'ellipsis' },
      provenance,
    }),
  ]

  let controlX = bounds.x + bounds.width - 18
  if (entry.voiceReplay && entry.voice) {
    controlX -= 106
    children.push(node(`backlog-entry-${index}-voice`, 'Button', {
      x: controlX,
      y: bounds.y + (bounds.height - 44) / 2,
      width: 106,
      height: 44,
    }, {
      text: 'Voice',
      intent: uiIntent(BACKLOG_REPLAY_VOICE_ACTION, { entryId: entry.id }),
      style: buttonStyle('#34455a'),
      provenance,
    }))
  }
  if (entry.rewindable) {
    controlX -= controlX < bounds.x + bounds.width - 18 ? 118 : 106
    children.push(node(`backlog-entry-${index}-jump`, 'Button', {
      x: controlX,
      y: bounds.y + (bounds.height - 44) / 2,
      width: 106,
      height: 44,
    }, {
      text: 'Jump',
      intent: uiIntent(BACKLOG_JUMP_ACTION, { entryId: entry.id }),
      style: buttonStyle('#594a32'),
      provenance,
    }))
  }

  return node(`backlog-entry-${index}`, 'Panel', bounds, {
    children,
    provenance,
    style: { backgroundColor: '#1a1e24', borderRadius: 4 },
  })
}

function node(
  id: string,
  kind: NativeUiSurfaceNodeProjection['kind'],
  bounds: NativeUiSurfaceRect,
  options: Omit<NativeUiSurfaceNodeProjection, 'bounds' | 'id' | 'kind' | 'visible'> = {},
): NativeUiSurfaceNodeProjection {
  return { id, kind, bounds, visible: true, ...options }
}

function uiIntent(action: string, metadata?: Record<string, string>) {
  return { event: 'ui/intent' as const, action, metadata }
}

function buttonStyle(backgroundColor: string) {
  return {
    backgroundColor,
    borderColor: '#697381',
    borderRadius: 4,
    borderWidth: 1,
    color: '#f5f6f8',
    fontSize: 18,
    textAlign: 'center' as const,
  }
}

function stageRect(context: NativeRendererFeatureSurfaceContext): NativeUiSurfaceRect {
  return { x: 0, y: 0, width: context.logicalWidth, height: context.logicalHeight }
}

function insetRect(rect: NativeUiSurfaceRect, horizontal: number, vertical: number): NativeUiSurfaceRect {
  return {
    x: rect.x + horizontal,
    y: rect.y + vertical,
    width: Math.max(0, rect.width - horizontal * 2),
    height: Math.max(0, rect.height - vertical * 2),
  }
}

function projectionProvenance(projection: BacklogProjection & Record<string, unknown>): NativePackageProvenance {
  return normalizeProvenance(
    stringValue(projection.contentPackageId),
    stringArray(projection.requiredRuntimePackages),
  )
}

function entryProvenance(entry: BacklogEntry): NativePackageProvenance {
  return normalizeProvenance(
    entry.point?.contentPackageId || entry.voice?.contentPackageId,
    [
      ...(entry.requiredRuntimePackages || []),
      ...(entry.point?.requiredRuntimePackages || []),
      ...(entry.voice?.requiredRuntimePackages || []),
    ],
  )
}

function mergeProvenance(...items: readonly NativePackageProvenance[]): NativePackageProvenance {
  return normalizeProvenance(
    items.map(item => item.contentPackageId).find(Boolean),
    items.flatMap(item => item.requiredRuntimePackages || []),
  )
}

function normalizeProvenance(contentPackageId: string | undefined, requiredRuntimePackages: readonly string[]) {
  const packageIds = [...new Set(requiredRuntimePackages.map(value => value.trim()).filter(Boolean))].sort()
  return {
    ...(contentPackageId ? { contentPackageId } : {}),
    ...(packageIds.length > 0 ? { requiredRuntimePackages: packageIds } : {}),
  }
}

function formatGameTime(gameTimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(gameTimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function requiredIntentString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Native backlog intent requires string payload field "${field}".`)
  }
  return value
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}
