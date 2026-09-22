export type UiFeatureJsonRecord = Record<string, unknown>

export interface UiFeatureSurfaceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface UiFeatureSurfaceContext {
  view: Readonly<UiFeatureJsonRecord>
  projection: Readonly<UiFeatureJsonRecord>
  logicalWidth: number
  logicalHeight: number
  safeArea: UiFeatureSurfaceRect
}

export interface UiFeatureSurfaceOverlay {
  elementId: string
  visible?: boolean
  renderMode?: 'default' | 'render-only'
  interactive?: boolean
  overlayStack?: string
  stackPriority?: number
  zIndex?: number
  /** Scene/chrome policy remains owned by the feature projection. */
  scene?: unknown
  surface: {
    key: string
    root?: unknown
  }
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export interface UiFeatureIntentAction {
  action: string
  event: string
  createPayload?: (payload: Readonly<UiFeatureJsonRecord>) => unknown
}

export interface UiFeatureSurfaceEntry {
  pluginId: string
  createOverlays: (
    context: UiFeatureSurfaceContext,
  ) => UiFeatureSurfaceOverlay | readonly UiFeatureSurfaceOverlay[] | undefined
  intentActions?: readonly UiFeatureIntentAction[]
}

export interface ResolvedUiFeatureIntent {
  event: string
  payload: unknown
}

export function createUiFeatureSurfaceOverlays(
  view: Readonly<UiFeatureJsonRecord>,
  entries: readonly UiFeatureSurfaceEntry[] = [],
): UiFeatureSurfaceOverlay[] {
  const plugins = recordValue(view.plugins)
  const layout = resolveFeatureStageLayout(view.layout)
  const overlays: UiFeatureSurfaceOverlay[] = []

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
    const scene = recordValue(projection.ui)?.scene
    const append = (overlay: UiFeatureSurfaceOverlay) => overlays.push({
      ...overlay,
      ...(scene && !overlay.scene ? { scene } : {}),
    })
    if (Array.isArray(result))
      result.forEach(append)
    else if (result)
      append(result as UiFeatureSurfaceOverlay)
  }

  return overlays
}

export function resolveUiFeatureIntent(
  entries: readonly UiFeatureSurfaceEntry[] | undefined,
  action: string,
  payload: Readonly<UiFeatureJsonRecord>,
): ResolvedUiFeatureIntent | undefined {
  let matched: UiFeatureIntentAction | undefined
  for (const entry of entries || []) {
    for (const candidate of entry.intentActions || []) {
      if (candidate.action !== action) {
        continue
      }
      if (matched) {
        throw new Error(`UI feature intent action "${action}" is registered more than once.`)
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

function resolveFeatureStageLayout(value: unknown): Pick<UiFeatureSurfaceContext, 'logicalWidth' | 'logicalHeight' | 'safeArea'> {
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

function recordValue(value: unknown): UiFeatureJsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UiFeatureJsonRecord
    : undefined
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
