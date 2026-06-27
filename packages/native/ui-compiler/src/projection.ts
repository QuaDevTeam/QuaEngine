import type {
  NativeQssDocument,
  NativeQssResolvedBounds,
  NativePackageProvenance,
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiProp,
  NativeQuiActionArgumentValue,
  NativeUiSurfaceIntentProjection,
  NativeUiSurfaceNodeKind,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceProjection,
  NativeUiSurfaceRect,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import {
  booleanProp,
  numberProp,
  propLiteralString,
  propString,
  stripQuotes,
} from './projection-props'
import { resolveStyleForNode } from './projection-selectors'
import { findNativeUiComponent } from './registry'

export interface CompileNativeUiSurfaceProjectionOptions {
  contentPackageId?: string
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  requiredRuntimePackages?: readonly string[]
  rootId?: string
}

interface QuiProjectionContext {
  ancestors: readonly NativeQuiAstNode[]
  parentBounds?: NativeUiSurfaceRect
}

const BASE_NODE_KINDS = new Set<NativeUiSurfaceNodeKind>([
  'Backdrop',
  'Box',
  'Button',
  'Column',
  'Divider',
  'Fragment',
  'Grid',
  'Image',
  'Layer',
  'Panel',
  'RichText',
  'Row',
  'SafeArea',
  'Scroll',
  'Spacer',
  'Stack',
  'Text',
])

const ZERO_RECT: NativeUiSurfaceRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
}

export function compileNativeUiSurfaceProjection(
  qui: NativeQuiDocument,
  options: CompileNativeUiSurfaceProjectionOptions = {},
): NativeUiSurfaceProjection {
  const qssDocuments = Array.isArray(options.qss)
    ? options.qss
    : options.qss ? [options.qss] : []
  const provenance = packageProvenanceFromOptions(options)
  const rootChildren = qui.tree
    .flatMap(node => surfaceNodeFromQuiNode(qui.source, node, { ancestors: [] }, qssDocuments, provenance))

  if (rootChildren.length === 0)
    return {}

  if (rootChildren.length === 1 && !options.rootId)
    return { root: rootChildren[0] }

  return {
    root: pruneSurfaceNode({
      id: options.rootId || 'root',
      kind: 'Fragment',
      bounds: { ...ZERO_RECT },
      ...(provenance ? { provenance } : {}),
      children: rootChildren,
    }),
  }
}

function surfaceNodeFromQuiNode(
  source: string,
  node: NativeQuiAstNode,
  context: QuiProjectionContext,
  qssDocuments: readonly NativeQssDocument[],
  provenance: NativePackageProvenance | undefined,
): NativeUiSurfaceNodeProjection[] {
  if (node.kind !== 'component' || !isSupportedSurfaceKind(node.name))
    return node.children.flatMap(child => surfaceNodeFromQuiNode(source, child, context, qssDocuments, provenance))

  const resolvedStyle = resolveStyleForNode({ node, ancestors: context.ancestors }, qssDocuments)
  const rect = rectFromProps(node.props, resolvedStyle.bounds, context.parentBounds)
  const childContext: QuiProjectionContext = {
    ancestors: [...context.ancestors, node],
    parentBounds: rect,
  }
  const children = node.children
    .flatMap(child => surfaceNodeFromQuiNode(source, child, childContext, qssDocuments, provenance))
  const text = textFromNode(source, node)
  const image = imageFromProps(node.props)
  const intent = intentFromNode(node)
  const id = propString(node.props, 'id') || stableNodeId(node)

  return [pruneSurfaceNode({
    id,
    kind: node.name as NativeUiSurfaceNodeKind,
    bounds: rect,
    clipChildren: resolvedStyle.clipChildren,
    visible: booleanProp(node.props, 'show') ?? resolvedStyle.visible,
    zIndex: resolvedStyle.zIndex,
    opacity: numberProp(node.props, 'opacity'),
    scrollOffsetX: numberProp(node.props, 'scroll-x'),
    scrollOffsetY: numberProp(node.props, 'scroll-y'),
    text,
    image,
    intent,
    style: resolvedStyle.style,
    ...(provenance ? { provenance } : {}),
    children,
  })]
}

function packageProvenanceFromOptions(
  options: CompileNativeUiSurfaceProjectionOptions,
): NativePackageProvenance | undefined {
  const contentPackageId = options.contentPackageId?.trim()
  const requiredRuntimePackages = Array.from(new Set(
    (options.requiredRuntimePackages ?? [])
      .map(packageId => packageId.trim())
      .filter(Boolean),
  )).sort()

  if (!contentPackageId && requiredRuntimePackages.length === 0)
    return undefined

  const provenance: NativePackageProvenance = {}
  if (contentPackageId)
    provenance.contentPackageId = contentPackageId
  if (requiredRuntimePackages.length > 0)
    provenance.requiredRuntimePackages = requiredRuntimePackages
  return provenance
}

function isSupportedSurfaceKind(name: string): boolean {
  return BASE_NODE_KINDS.has(name as NativeUiSurfaceNodeKind) && Boolean(findNativeUiComponent(name))
}

function stableNodeId(node: NativeQuiAstNode): string {
  const key = propString(node.props, 'key')
  if (key)
    return `${node.name}:${key}`
  return `${node.name}:${node.nameRange.start.line}:${node.nameRange.start.character}`
}

function textFromNode(source: string, node: NativeQuiAstNode): string | undefined {
  if (node.name !== 'Text' && node.name !== 'RichText' && node.name !== 'Button')
    return propString(node.props, 'text') || propString(node.props, 'label')

  return propString(node.props, 'text')
    || propString(node.props, 'label')
    || textContentFromBody(source, node)
}

function textContentFromBody(source: string, node: NativeQuiAstNode): string | undefined {
  if (node.children.length > 0 || !node.bodyRange)
    return undefined

  const start = offsetAtPosition(source, node.bodyRange.start)
  const end = offsetAtPosition(source, node.bodyRange.end)
  const text = stripQuotes(source.slice(start, end).trim()).trim()
  return text ? text : undefined
}

function imageFromProps(props: readonly NativeQuiProp[]) {
  const src = propLiteralString(props, 'src') || propLiteralString(props, 'image')
  if (!src || !isSafePackageAssetName(src))
    return undefined

  const assetType = propLiteralString(props, 'asset-type') || 'images'
  if (!isSafeNativeAssetType(assetType))
    return undefined

  return { assetType, assetName: src }
}

function intentFromNode(node: NativeQuiAstNode): NativeUiSurfaceIntentProjection | undefined {
  const action = node.actions[0]
  if (!action)
    return undefined

  const metadata = literalActionMetadata(action.arguments)
  const firstArgument = action.arguments[0]
  const choiceId = action.event === 'choice/select' && firstArgument?.kind === 'literal' && typeof firstArgument.value === 'string'
    ? firstArgument.value
    : undefined

  return {
    event: action.event,
    ...(choiceId ? { choiceId } : {}),
    action: action.action,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

function literalActionMetadata(args: readonly { kind: string, value?: NativeQuiActionArgumentValue }[]): Record<string, NativeQuiActionArgumentValue> {
  const metadata: Record<string, NativeQuiActionArgumentValue> = {}
  args.forEach((argument, index) => {
    if (argument.kind === 'literal' && argument.value !== undefined)
      metadata[`arg${index}`] = argument.value
  })
  return metadata
}

function rectFromProps(
  props: readonly NativeQuiProp[],
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
): NativeUiSurfaceRect {
  const width = numberProp(props, 'width') ?? bounds?.width ?? 0
  const height = numberProp(props, 'height') ?? bounds?.height ?? 0
  return {
    x: numberProp(props, 'x') ?? resolveNativeQssBoundX(bounds, parentBounds, width),
    y: numberProp(props, 'y') ?? resolveNativeQssBoundY(bounds, parentBounds, height),
    width,
    height,
  }
}

function resolveNativeQssBoundX(
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
  width: number,
): number {
  if (bounds?.x !== undefined)
    return bounds.x
  if (bounds?.right !== undefined && parentBounds)
    return parentBounds.x + parentBounds.width - width - bounds.right
  return 0
}

function resolveNativeQssBoundY(
  bounds: NativeQssResolvedBounds | undefined,
  parentBounds: NativeUiSurfaceRect | undefined,
  height: number,
): number {
  if (bounds?.y !== undefined)
    return bounds.y
  if (bounds?.bottom !== undefined && parentBounds)
    return parentBounds.y + parentBounds.height - height - bounds.bottom
  return 0
}

function offsetAtPosition(source: string, position: { character: number, line: number }): number {
  const lineStarts = createLineStartOffsets(source)
  const line = Math.max(0, Math.min(position.line, lineStarts.length - 1))
  const nextLineStart = lineStarts[line + 1] ?? source.length
  return Math.min(lineStarts[line] + Math.max(0, position.character), nextLineStart)
}

function createLineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }
  return starts
}

function pruneSurfaceNode(node: NativeUiSurfaceNodeProjection): NativeUiSurfaceNodeProjection {
  if (node.visible === undefined)
    delete node.visible
  if (node.clipChildren === undefined)
    delete node.clipChildren
  if (node.zIndex === undefined)
    delete node.zIndex
  if (node.opacity === undefined)
    delete node.opacity
  if (node.scrollOffsetX === undefined)
    delete node.scrollOffsetX
  if (node.scrollOffsetY === undefined)
    delete node.scrollOffsetY
  if (!node.text)
    delete node.text
  if (!node.image)
    delete node.image
  if (!node.intent)
    delete node.intent
  if (!node.style || Object.keys(node.style).length === 0)
    delete node.style
  if (!node.provenance || Object.keys(node.provenance).length === 0)
    delete node.provenance
  if (!node.children || node.children.length === 0)
    delete node.children
  return node
}
