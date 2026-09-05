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

export interface BacklogNativeRendererOptions {
  /** Dense two-column history rows with metadata alongside dialogue. */
  density?: 'comfortable' | 'compact'
  /** Product-owned layout policy; receives logical bounds only. */
  resolvePanelBounds?: (context: NativeRendererFeatureSurfaceContext, preferred: NativeUiSurfaceRect) => NativeUiSurfaceRect
}

export function createBacklogNativeRendererFeature(options: BacklogNativeRendererOptions = {}): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: BACKLOG_PLUGIN_ID,
    createOverlays: context => createBacklogNativeOverlays(context, options),
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

function createBacklogNativeOverlays(context: NativeRendererFeatureSurfaceContext, options: BacklogNativeRendererOptions) {
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
      root: createBacklogRoot(context, projection.entries || [], overlayProvenance, options),
    },
    ...overlayProvenance,
  }
}

function createBacklogRoot(
  context: NativeRendererFeatureSurfaceContext,
  entries: readonly BacklogEntry[],
  provenance: NativePackageProvenance,
  options: BacklogNativeRendererOptions,
): NativeUiSurfaceNodeProjection {
  const compact = options.density === 'compact'
  const edge = compact ? 31 : Math.max(28, Math.min(context.safeArea.width, context.logicalHeight) * 0.035)
  const available = insetRect(context.safeArea, edge, edge)
  const width = Math.min(1040, available.width)
  const height = Math.min(660, available.height)
  const preferred = { x: available.x + (available.width - width) / 2,
    y: available.y + (available.height - height) / 2, width, height }
  const panelBounds = options.resolvePanelBounds?.(context, preferred) ?? preferred
  const headerHeight = compact ? 88 : Math.max(64, Math.min(92, panelBounds.height * 0.1))
  const footerGap = Math.max(18, panelBounds.height * 0.025)
  const contentTop = panelBounds.y + headerHeight + footerGap
  const contentBottom = panelBounds.y + panelBounds.height - edge
  const recentEntries = [...entries].reverse()
  const visibleForSizing = Math.min(recentEntries.length, MAX_VISIBLE_ENTRIES)
  const entryGap = compact ? 8 : Math.max(12, panelBounds.height * 0.014)
  const availableHeight = Math.max(0, contentBottom - contentTop)
  const entryHeight = visibleForSizing > 0
    ? Math.min(140, Math.max(72, (availableHeight - entryGap * (visibleForSizing - 1)) / visibleForSizing))
    : 0

  let entryY = contentTop
  const rows = recentEntries.map((entry, index) => {
    const body = entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
    const controlsWidth = (entry.rewindable ? 118 : 0) + (entry.voiceReplay && entry.voice ? 118 : 0)
    const bodyWidth = Math.max(1, panelBounds.width - edge * 2 - controlsWidth - (compact ? 120 : 60))
    const lines = body.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(
      Array.from(line).reduce((ems, char) => ems + (char.charCodeAt(0) < 128 ? 0.6 : 1), 0) * (compact ? 13 : 21) / bodyWidth,
    )), 0)
    const height = compact ? Math.max(56, 37 + lines * 19) : Math.max(entryHeight, 48 + lines * 32)
    const row = createBacklogEntryNode(entry, index, {
      x: panelBounds.x + edge, y: entryY, width: panelBounds.width - edge * 2, height,
    }, provenance, compact)
    entryY += height + entryGap
    return row
  })
  const children: NativeUiSurfaceNodeProjection[] = [
    node('backlog-backdrop', 'Backdrop', stageRect(context), {
      intent: uiIntent(BACKLOG_CLOSE_ACTION),
      style: { backgroundColor: '#050608', opacity: 0.84 },
      provenance,
    }),
    node('backlog-panel', 'Panel', panelBounds, {
      style: {
        backgroundColor: compact ? '#07080c' : '#12151a',
        ...(compact ? { backgroundGradient: { kind: 'linear' as const, angleDegrees: 180,
          stops: [{ color: 'rgba(20,22,30,0.96)', position: 0 }, { color: 'rgba(6,7,11,0.97)', position: 1 }] } } : {}),
        borderColor: compact ? 'rgba(245,226,190,0.34)' : '#5f6773',
        borderRadius: compact ? 2 : 6,
        borderWidth: 1,
        boxShadow: panelShadow(),
      },
      provenance,
      children: [
        node('backlog-title', 'Text', {
          x: panelBounds.x + edge,
          y: panelBounds.y + (compact ? 31 : edge * 0.5),
          width: panelBounds.width - edge * 2 - 112,
          height: compact ? 42 : headerHeight - edge * 0.5,
        }, {
          text: 'Backlog',
          style: {
            color: '#f4f5f7',
            fontSize: compact ? 38 : 34,
            fontFamily: ['Noto Sans'],
            fontWeight: 700,
            textShadow: titleShadow(),
          },
          provenance,
        }),
        node('backlog-close', 'Button', {
          x: panelBounds.x + panelBounds.width - edge - (compact ? 42 : 96),
          y: panelBounds.y + (compact ? 31 : edge * 0.5),
          width: compact ? 42 : 96,
          height: compact ? 42 : Math.max(48, headerHeight - edge),
        }, {
          text: compact ? '×' : 'Close',
          intent: uiIntent(BACKLOG_CLOSE_ACTION),
          style: compact ? { backgroundColor: '#ece5d9', color: '#0d0d12', fontSize: 28, textAlign: 'center' } : buttonStyle('#2b313a'),
          provenance,
        }),
        ...(compact ? [node('backlog-divider', 'Panel', { x: panelBounds.x + edge, y: panelBounds.y + 87, width: panelBounds.width - edge * 2, height: 1 }, { style: { backgroundColor: 'rgba(245,226,190,0.18)' }, provenance })] : []),
        node('backlog-scroll', 'Scroll', {
          x: panelBounds.x + edge,
          y: contentTop,
          width: panelBounds.width - edge * 2,
          height: Math.max(0, contentBottom - contentTop),
        }, {
          clipChildren: true,
          provenance,
          children: recentEntries.length > 0
            ? rows
            : [node('backlog-empty', 'Text', {
                x: panelBounds.x + edge,
                y: contentTop,
                width: panelBounds.width - edge * 2,
                height: Math.max(80, availableHeight),
              }, {
                text: 'No backlog entries',
                style: { color: '#aeb4bd', fontSize: 24, textAlign: 'center' },
                provenance,
              })],
        }),
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
  compact = false,
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
      height: 22,
    }, {
      text: metadata,
      style: { color: '#8f98a5', fontSize: 16 },
      provenance,
    }),
    node(`backlog-entry-${index}-body`, 'Text', {
      x: bounds.x + 18,
      y: bounds.y + 38,
      width: Math.max(0, textRight - bounds.x - 18),
      height: Math.max(28, bounds.height - 48),
    }, {
      text: body,
      style: { color: '#eef0f3', fontSize: 21, lineHeight: 32, whiteSpace: 'pre-wrap' },
      provenance,
    }),
  ]

  if (compact) {
    children.splice(0, children.length,
      node(`backlog-entry-${index}-index`, 'Text', { x: bounds.x + 12, y: bounds.y + 10, width: 86, height: 15 }, {
        text: String(index + 1).padStart(2, '0'), style: { color: '#81e5ff', fontSize: 10, fontFamily: ['Noto Sans'] }, provenance,
      }),
      node(`backlog-entry-${index}-metadata`, 'Text', { x: bounds.x + 12, y: bounds.y + 28, width: 86, height: 15 }, {
        text: formatGameTime(entry.gameTimeMs), style: { color: 'rgba(247,242,234,0.48)', fontSize: 10, fontFamily: ['Noto Sans'] }, provenance,
      }),
      node(`backlog-entry-${index}-speaker`, 'Text', { x: bounds.x + 108, y: bounds.y + 10, width: Math.max(1, textRight - bounds.x - 108), height: 15 }, {
        text: entry.speaker || '', style: { color: '#ffe3a0', fontSize: 13, fontFamily: ['Noto Sans'] }, provenance,
      }),
      node(`backlog-entry-${index}-body`, 'Text', { x: bounds.x + 108, y: bounds.y + 28, width: Math.max(1, textRight - bounds.x - 108), height: bounds.height - 37 }, {
        text: body, style: { color: 'rgba(255,250,242,0.9)', fontSize: 13, fontFamily: ['Noto Sans'], lineHeight: 19, whiteSpace: 'pre-wrap' }, provenance,
      }),
    )
  }

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
    style: compact
      ? { backgroundColor: '#080a10', borderColor: 'rgba(245,226,190,0.18)', borderWidth: 1, borderRadius: 4,
          backgroundGradient: { kind: 'linear', angleDegrees: 180, stops: [{ color: 'rgba(20,24,33,0.88)', position: 0 }, { color: 'rgba(7,8,12,0.92)', position: 1 }] } }
      : { backgroundColor: '#1a1e24', borderRadius: 4 },
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

function panelShadow() {
  return {
    offsetX: 0,
    offsetY: 18,
    blurRadius: 48,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.42)',
    inset: false,
  }
}

function titleShadow() {
  return {
    offsetX: 0,
    offsetY: 2,
    blurRadius: 10,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.72)',
    inset: false,
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
