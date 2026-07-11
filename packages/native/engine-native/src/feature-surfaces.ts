export type NativeRendererFeatureJsonRecord = Record<string, unknown>

export interface NativeRendererFeatureSurfaceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeRendererFeatureSurfaceContext {
  view: Readonly<NativeRendererFeatureJsonRecord>
  projection: Readonly<NativeRendererFeatureJsonRecord>
  logicalWidth: number
  logicalHeight: number
  safeArea: NativeRendererFeatureSurfaceRect
}

export interface NativeRendererFeatureSurfaceOverlay {
  elementId: string
  visible?: boolean
  renderMode?: 'default' | 'render-only'
  interactive?: boolean
  overlayStack?: string
  stackPriority?: number
  zIndex?: number
  surface: {
    key: string
    root?: unknown
  }
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface NativeRendererFeatureIntentAction {
  action: string
  event: string
  createPayload?: (payload: Readonly<NativeRendererFeatureJsonRecord>) => unknown
}

export interface NativeRendererFeatureSurfaceEntry {
  pluginId: string
  createOverlays: (
    context: NativeRendererFeatureSurfaceContext,
  ) => NativeRendererFeatureSurfaceOverlay | readonly NativeRendererFeatureSurfaceOverlay[] | undefined
  intentActions?: readonly NativeRendererFeatureIntentAction[]
}

export interface ResolvedNativeRendererFeatureIntent {
  event: string
  payload: unknown
}

export function createNativeRendererFeatureSurfaceOverlays(
  view: Readonly<NativeRendererFeatureJsonRecord>,
  entries: readonly NativeRendererFeatureSurfaceEntry[] = [],
): NativeRendererFeatureSurfaceOverlay[] {
  const plugins = recordValue(view.plugins)
  const layout = resolveFeatureStageLayout(view.layout)
  const overlays: NativeRendererFeatureSurfaceOverlay[] = []

  for (const entry of entries) {
    const projection = recordValue(plugins?.[entry.pluginId])
    if (!projection) {
      continue
    }
    const result = entry.createOverlays({
      view,
      projection,
      ...layout,
    })
    if (Array.isArray(result)) {
      overlays.push(...result as readonly NativeRendererFeatureSurfaceOverlay[])
    }
    else if (result) {
      overlays.push(result as NativeRendererFeatureSurfaceOverlay)
    }
  }

  return overlays
}

export function resolveNativeRendererFeatureIntent(
  entries: readonly NativeRendererFeatureSurfaceEntry[] | undefined,
  action: string,
  payload: Readonly<NativeRendererFeatureJsonRecord>,
): ResolvedNativeRendererFeatureIntent | undefined {
  let matched: NativeRendererFeatureIntentAction | undefined
  for (const entry of entries || []) {
    for (const candidate of entry.intentActions || []) {
      if (candidate.action !== action) {
        continue
      }
      if (matched) {
        throw new Error(`Native renderer feature intent action "${action}" is registered more than once.`)
      }
      matched = candidate
    }
  }
  if (!matched) {
    return undefined
  }
  return {
    event: matched.event,
    payload: matched.createPayload ? matched.createPayload(payload) : payload,
  }
}

function resolveFeatureStageLayout(value: unknown): Pick<NativeRendererFeatureSurfaceContext, 'logicalWidth' | 'logicalHeight' | 'safeArea'> {
  const layout = recordValue(value)
  const logicalHeight = positiveNumber(layout?.height, 1080)
  const referenceAspect = positiveNumber(layout?.width, 1920) / logicalHeight
  const aspectRatio = positiveNumber(layout?.aspectRatio, referenceAspect)
  const logicalWidth = logicalHeight * aspectRatio
  const safeAspectRatio = Math.min(aspectRatio, positiveNumber(layout?.minAspectRatio, aspectRatio))
  const safeWidth = logicalHeight * safeAspectRatio
  return {
    logicalWidth,
    logicalHeight,
    safeArea: {
      x: (logicalWidth - safeWidth) / 2,
      y: 0,
      width: safeWidth,
      height: logicalHeight,
    },
  }
}

function recordValue(value: unknown): NativeRendererFeatureJsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as NativeRendererFeatureJsonRecord
    : undefined
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
