// ─── Input types (structural — no runtime dep on @quajs/native-ui) ─────────
//
// Re-declared here so @quajs/native-ui-compiler has no runtime dependency on
// the JSX package.  Any object satisfying these shapes (including the real
// QuiNode / QuiIntent from @quajs/native-ui) is accepted.

/** Intermediate node produced by a JSX runtime, e.g. @quajs/native-ui. */
export interface QuiNode {
  readonly kind: string
  readonly id?: string
  readonly classes: readonly string[]
  readonly props: Readonly<Record<string, unknown>>
  readonly children: readonly QuiNode[]
  readonly key?: string | number | null
}

/** Serialisable action intent — create via ui/choice/save helpers. */
export interface QuiIntent {
  readonly __quiIntent: true
  readonly event: 'choice/select' | 'ui/intent'
  readonly action?: string
  readonly choiceId?: string
  readonly metadata?: Readonly<Record<string, boolean | null | number | string>>
}

function isQuiIntent(value: unknown): value is QuiIntent {
  return (
    typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>).__quiIntent === true
  )
}

import type {
  NativePackageProvenance,
  NativeQssDocument,
  NativeQssResolvedLayout,
  NativeQssResolvedStyle,
  NativeQuiAstNode,
  NativeQuiProp,
  NativeUiRange,
  NativeUiSurfaceControlProjection,
  NativeUiSurfaceControlOptionProjection,
  NativeUiSurfaceIntentProjection,
  NativeUiSurfaceNodeKind,
  NativeUiSurfaceProjection,
  NativeUiSurfaceRect,
  NativeUiSurfaceVideoProjection,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import {
  applyNativeQssStructuralLayout,
  stripNativeQssCompilerLayout,
  type NativeUiCompilerSurfaceNodeProjection,
} from './projection-layout'
import { pruneSurfaceNode, ZERO_RECT } from './projection-node-helpers'
import { resolveStyleForNode } from './projection-selectors'
import { parseNativeQssObjectFit } from './qss-style-values'
import { canProjectNativeUiIntent } from './surface-intents'

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_RANGE: NativeUiRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
}

function makeIdProp(id: string): NativeQuiProp {
  return { name: 'id', value: id, nameRange: EMPTY_RANGE, valueRange: EMPTY_RANGE, range: EMPTY_RANGE }
}

/** Build a minimal NativeQuiAstNode adapter for QSS selector matching.
 *  Passes the node's id (as a NativeQuiProp) so id-based selectors work. */
function makeAstAdapter(node: QuiNode): NativeQuiAstNode {
  return {
    name: node.kind,
    classes: node.classes as string[],
    kind: 'component',
    props: node.id ? [makeIdProp(node.id)] : [],
    actions: [],
    children: [],
    nameRange: EMPTY_RANGE,
    range: EMPTY_RANGE,
  }
}

function normaliseQssDocs(qss: CompileQuiTsxProjectionOptions['qss']): readonly NativeQssDocument[] {
  if (!qss) return []
  return Array.isArray(qss) ? qss : [qss as NativeQssDocument]
}

function provenanceFromOptions(options: CompileQuiTsxProjectionOptions): NativePackageProvenance | undefined {
  if (!options.contentPackageId && !options.requiredRuntimePackages?.length)
    return undefined
  return {
    contentPackageId: options.contentPackageId,
    // deduplicate, preserving first-seen order (mirrors compileNativeUiSurfaceProjection)
    requiredRuntimePackages: options.requiredRuntimePackages
      ? [...new Set(options.requiredRuntimePackages)]
      : undefined,
  }
}

function boundsFromQuiNode(
  props: Readonly<Record<string, unknown>>,
  resolvedBounds: { x?: number, y?: number, right?: number, bottom?: number, width?: number, height?: number } | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
): NativeUiSurfaceRect {
  const num = (key: string) => {
    const v = props[key]
    return typeof v === 'number' ? v : undefined
  }
  const width = num('width') ?? resolvedBounds?.width ?? 0
  const height = num('height') ?? resolvedBounds?.height ?? 0
  // Mirrors rectFromProps: `right` / `bottom` resolve against the parent rect.
  const x = num('x') ?? resolvedBounds?.x
    ?? (resolvedBounds?.right !== undefined && parentBounds
      ? parentBounds.x + parentBounds.width - width - resolvedBounds.right
      : 0)
  const y = num('y') ?? resolvedBounds?.y
    ?? (resolvedBounds?.bottom !== undefined && parentBounds
      ? parentBounds.y + parentBounds.height - height - resolvedBounds.bottom
      : 0)
  return { x, y, width, height }
}

/** Mirror of projection.ts — applies the resolved QSS transform to a rect. */
function applyResolvedTransform(
  rect: NativeUiSurfaceRect,
  transform: NativeQssResolvedLayout['transform'],
): NativeUiSurfaceRect {
  if (!transform)
    return rect
  const width = rect.width * transform.scaleX
  const height = rect.height * transform.scaleY
  return {
    x: rect.x + transform.translateX + (rect.width - width) * transform.originX,
    y: rect.y + transform.translateY + (rect.height - height) * transform.originY,
    width,
    height,
  }
}

/**
 * The Rust `UiSurfaceNodeKind` enum does not know the composite control and
 * media kinds yet. Project them as `Box` (control semantics still travel via
 * the `control` field) so a surface using them cannot fail frame validation.
 */
function projectedSurfaceKind(kind: string): NativeUiSurfaceNodeKind {
  if (kind === 'Slider' || kind === 'Switch' || kind === 'Select' || kind === 'Video')
    return 'Box'
  return kind as NativeUiSurfaceNodeKind
}

function intentFromAction(action: unknown): NativeUiSurfaceIntentProjection | undefined {
  if (!action || !isQuiIntent(action))
    return undefined
  return {
    event: action.event,
    ...(action.action !== undefined ? { action: action.action } : {}),
    ...(action.choiceId !== undefined ? { choiceId: action.choiceId } : {}),
    ...(action.metadata ? { metadata: action.metadata } : {}),
  }
}

function imageFromQuiProps(props: Readonly<Record<string, unknown>>): { assetName: string, assetType: string } | undefined {
  const src = props.src
  if (typeof src !== 'string' || !src || !isSafePackageAssetName(src)) return undefined
  const assetType = typeof props.assetType === 'string' && props.assetType
    ? props.assetType
    : 'images'
  if (!isSafeNativeAssetType(assetType)) return undefined
  return { assetName: src, assetType }
}

function videoFromQuiProps(props: Readonly<Record<string, unknown>>): NativeUiSurfaceVideoProjection | undefined {
  const src = props.src
  if (typeof src !== 'string' || !src || !isSafePackageAssetName(src)) return undefined
  const assetType = typeof props.assetType === 'string' && props.assetType
    ? props.assetType
    : 'videos'
  if (!isSafeNativeAssetType(assetType)) return undefined
  const result: NativeUiSurfaceVideoProjection = { assetName: src, assetType }
  if (props.looped === true) result.looped = true
  if (props.muted === true) result.muted = true
  if (typeof props.playbackRate === 'number' && props.playbackRate !== 1)
    result.playbackRate = props.playbackRate
  const fit = typeof props.objectFit === 'string'
    ? parseNativeQssObjectFit(props.objectFit)
    : undefined
  if (fit) result.objectFit = fit
  return result
}

type QuiRawControlOption = { label: string; intent: unknown }

function controlOptionsFromProps(
  raw: unknown,
): NativeUiSurfaceControlOptionProjection[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const result: NativeUiSurfaceControlOptionProjection[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return undefined
    const { label, intent } = item as QuiRawControlOption
    if (typeof label !== 'string') return undefined
    const resolved = intentFromAction(intent)
    if (!resolved) return undefined
    result.push({ label, intent: resolved })
  }
  return result
}

function controlFromQuiProps(
  kind: string,
  props: Readonly<Record<string, unknown>>,
): NativeUiSurfaceControlProjection | undefined {
  const selectedIndex = typeof props.selectedIndex === 'number' ? props.selectedIndex : undefined
  if (selectedIndex === undefined) return undefined
  const options = controlOptionsFromProps(props.options)
  if (!options || options.length === 0) return undefined
  const parts = (typeof props.parts === 'object' && props.parts !== null)
    ? props.parts as Record<string, string>
    : {}

  if (kind === 'Slider') {
    return {
      kind: 'range',
      selectedIndex,
      options,
      parts: {
        progress: parts.progress ?? 'slider-progress',
        thumb: parts.thumb ?? 'slider-thumb',
        ...(parts.thumbHalo ? { thumbHalo: parts.thumbHalo } : {}),
        value: parts.value ?? 'slider-value',
      },
    }
  }
  if (kind === 'Switch') {
    return {
      kind: 'switch',
      selectedIndex,
      options,
      parts: {
        track: parts.track ?? 'switch-track',
        thumb: parts.thumb ?? 'switch-thumb',
        value: parts.value ?? 'switch-value',
      },
    }
  }
  if (kind === 'Select') {
    return {
      kind: 'select',
      selectedIndex,
      options,
      parts: {
        value: parts.value ?? 'select-value',
        chevron: parts.chevron ?? 'select-chevron',
      },
    }
  }
  return undefined
}

/** Mirror of projection.ts — adjusts radial circle gradient radius for non-square bounds. */
function resolveGradientGeometry(
  style: NativeQssResolvedStyle,
  bounds: NativeUiSurfaceRect,
): NativeQssResolvedStyle {
  const gradient = style.backgroundGradient
  if (gradient?.kind !== 'radial' || gradient.shape !== 'circle')
    return style
  const centerX = gradient.centerX ?? 0.5
  const centerY = gradient.centerY ?? 0.5
  const aspect = bounds.width > 0 && bounds.height > 0 ? bounds.height / bounds.width : 1
  const h = Math.max(centerX, 1 - centerX)
  const v = Math.max(centerY, 1 - centerY) * aspect
  return { ...style, backgroundGradient: { ...gradient, radius: Math.hypot(h, v) } }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface CompileQuiTsxProjectionOptions {
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
  rootId?: string
}

/**
 * Convert a QuiNode tree (from @quajs/native-ui JSX runtime) into a
 * NativeUiSurfaceProjection consumed by the Rust wgpu renderer.
 * Equivalent to compileNativeUiSurfaceProjection but for the TSX path.
 */
export function compileQuiTsxProjection(
  root: QuiNode | null,
  options: CompileQuiTsxProjectionOptions = {},
): NativeUiSurfaceProjection {
  if (!root) return {}

  const qssDocs = normaliseQssDocs(options.qss)
  const provenance = provenanceFromOptions(options)
  const state: TsxTraversalState = { fallbackCounter: 0 }
  const nodes = surfaceNodesFromQuiChildren([root], [], qssDocs, provenance, state, undefined)

  if (nodes.length === 0) return {}
  if (nodes.length === 1 && !options.rootId)
    return { root: stripNativeQssCompilerLayout(nodes[0]) }

  return {
    root: stripNativeQssCompilerLayout(pruneSurfaceNode({
      id: options.rootId ?? 'root',
      kind: 'Fragment',
      bounds: { ...ZERO_RECT },
      visible: true,
      ...(provenance ? { provenance } : {}),
      children: nodes,
    }) as NativeUiCompilerSurfaceNodeProjection),
  }
}

// ─── Tree traversal ──────────────────────────────────────────────────────────

interface TsxTraversalState {
  /** Per-compile counter for idless nodes, so fallback ids stay unique. */
  fallbackCounter: number
}

function surfaceNodesFromQuiChildren(
  children: readonly QuiNode[],
  ancestors: readonly NativeQuiAstNode[],
  qssDocs: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
  state: TsxTraversalState,
  parentBounds: NativeUiSurfaceRect | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  return children.flatMap(child =>
    surfaceNodeFromQuiNode(child, ancestors, qssDocs, provenance, state, parentBounds))
}

function surfaceNodeFromQuiNode(
  node: QuiNode,
  ancestors: readonly NativeQuiAstNode[],
  qssDocs: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
  state: TsxTraversalState,
  parentBounds: NativeUiSurfaceRect | undefined,
): NativeUiCompilerSurfaceNodeProjection[] {
  if (node.kind === 'Fragment')
    return surfaceNodesFromQuiChildren(node.children, ancestors, qssDocs, provenance, state, parentBounds)

  const astAdapter = makeAstAdapter(node)
  const resolvedStyle = resolveStyleForNode({ node: astAdapter, ancestors }, qssDocs)
  const untransformedBounds = boundsFromQuiNode(node.props, resolvedStyle.bounds, parentBounds)
  const bounds = applyResolvedTransform(untransformedBounds, resolvedStyle.layout?.transform)

  const childAncestors = [...ancestors, astAdapter]
  const rawChildren = surfaceNodesFromQuiChildren(node.children, childAncestors, qssDocs, provenance, state, bounds)
  const children = applyNativeQssStructuralLayout(
    projectedSurfaceKind(node.kind),
    bounds,
    rawChildren,
    resolvedStyle.layout,
  )

  const props = node.props
  const show = typeof props.show === 'boolean' ? props.show : undefined
  const opacity = typeof props.opacity === 'number' ? props.opacity : undefined
  // scrollX/scrollY replaced the legacy 'scroll-x'/'scroll-y' kebab props
  const scrollOffsetX = typeof props.scrollX === 'number' ? (props.scrollX as number) : undefined
  const scrollOffsetY = typeof props.scrollY === 'number' ? (props.scrollY as number) : undefined
  const text = typeof props.text === 'string' ? props.text : undefined
  const image = node.kind === 'Image' ? imageFromQuiProps(props) : undefined
  const video = node.kind === 'Video' ? videoFromQuiProps(props) : undefined
  // Button uses onClick, Backdrop uses onDismiss; accept either
  const intent = resolvedStyle.interactive === false || !canProjectNativeUiIntent(node.kind)
    ? undefined
    : intentFromAction(props.onClick ?? props.onDismiss)
  const control = controlFromQuiProps(node.kind, props)
  // Explicit id wins, then the JSX key, then a per-compile counter — two
  // idless same-kind siblings must never share a fallback id, because the
  // Rust facade rejects duplicate ids within a frame.
  const id = typeof node.id === 'string' && node.id
    ? node.id
    : node.key !== null && node.key !== undefined
      ? `${node.kind}:${String(node.key)}`
      : `${node.kind}:${++state.fallbackCounter}`

  const surfaceNode: NativeUiCompilerSurfaceNodeProjection = {
    id,
    kind: projectedSurfaceKind(node.kind),
    bounds,
    visible: show ?? resolvedStyle.visible ?? true,
    clipChildren: resolvedStyle.clipChildren,
    zIndex: resolvedStyle.zIndex,
    ...(opacity !== undefined ? { opacity } : {}),
    ...(scrollOffsetX !== undefined ? { scrollOffsetX } : {}),
    ...(scrollOffsetY !== undefined ? { scrollOffsetY } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
    ...(intent ? { intent } : {}),
    ...(control ? { control } : {}),
    style: resolveGradientGeometry(resolvedStyle.style ?? {}, bounds),
    stateStyles: resolvedStyle.stateStyles
      ? Object.fromEntries(
          Object.entries(resolvedStyle.stateStyles).map(([stateName, ss]) => {
            const stateBounds = applyResolvedTransform(untransformedBounds, ss?.layout?.transform)
            return [stateName, {
              bounds: stateBounds,
              style: resolveGradientGeometry(ss?.style ?? {}, stateBounds),
            }]
          }),
        )
      : undefined,
    transitions: resolvedStyle.transitions,
    compilerLayout: resolvedStyle.layout,
    ...(provenance ? { provenance } : {}),
    children,
  }

  return [pruneSurfaceNode(surfaceNode) as NativeUiCompilerSurfaceNodeProjection]
}
