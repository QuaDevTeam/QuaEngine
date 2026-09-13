import type {
  NativePackageProvenance,
  NativeQuiActionArgument,
  NativeQuiActionArgumentValue,
  NativeQuiAstNode,
  NativeQuiProp,
  NativeUiSurfaceIntentProjection,
  NativeUiSurfaceNodeKind,
} from './types'
import { isSafeNativeAssetType, isSafePackageAssetName } from './assets'
import {
  currentLoopScopedKey,
  resolvedActionArgument,
  scopedNodeId,
  templateStringProp,
  templateStringValue,
  type NativeUiTemplateScope,
} from './projection-template'
import {
  propLiteralString,
  stripQuotes,
} from './projection-props'
import { findNativeUiComponent } from './registry'

interface NativeProjectionProvenanceOptions {
  contentPackageId?: string
  requiredRuntimePackages?: readonly string[]
}

export const BASE_NODE_KINDS = new Set<NativeUiSurfaceNodeKind>([
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

export function packageProvenanceFromOptions(
  options: NativeProjectionProvenanceOptions,
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

export function isSupportedSurfaceKind(name: string): boolean {
  return BASE_NODE_KINDS.has(name as NativeUiSurfaceNodeKind) && Boolean(findNativeUiComponent(name))
}

export function nodeId(node: NativeQuiAstNode, scope: NativeUiTemplateScope): string {
  const explicit = templateStringProp(node.props, 'id', scope)
  if (explicit)
    return scopedNodeId(explicit, scope)
  return stableNodeId(node, scope)
}

function stableNodeId(node: NativeQuiAstNode, scope: NativeUiTemplateScope): string {
  const key = templateStringProp(node.props, 'key', scope)
  if (key)
    return `${node.name}:${currentLoopScopedKey(scope, key)}`
  return scopedNodeId(`${node.name}:${node.nameRange.start.line}:${node.nameRange.start.character}`, scope)
}

export function textFromNode(
  source: string,
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): string | undefined {
  if (node.name !== 'Text' && node.name !== 'RichText' && node.name !== 'Button')
    return templateStringProp(node.props, 'text', scope) || templateStringProp(node.props, 'label', scope)

  return templateStringProp(node.props, 'text', scope)
    || templateStringProp(node.props, 'label', scope)
    || textContentFromBody(source, node, scope)
}

function textContentFromBody(
  source: string,
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): string | undefined {
  if (node.children.length > 0 || !node.bodyRange)
    return undefined

  const start = offsetAtPosition(source, node.bodyRange.start)
  const end = offsetAtPosition(source, node.bodyRange.end)
  const raw = source.slice(start, end).trim()
  const text = templateStringValue(raw, scope)?.trim() || stripQuotes(raw).trim()
  return text ? text : undefined
}

export function imageFromProps(props: readonly NativeQuiProp[]) {
  const src = propLiteralString(props, 'src') || propLiteralString(props, 'image')
  if (!src || !isSafePackageAssetName(src))
    return undefined

  const assetType = propLiteralString(props, 'asset-type') || 'images'
  if (!isSafeNativeAssetType(assetType))
    return undefined

  return { assetType, assetName: src }
}

export function intentFromNode(
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): NativeUiSurfaceIntentProjection | undefined {
  const action = node.actions[0]
  if (!action)
    return undefined

  const metadata = literalActionMetadata(action.arguments, scope)
  const firstArgument = action.arguments[0]
  const resolvedFirstArgument = firstArgument
    ? resolvedActionArgument(firstArgument, scope)
    : undefined
  const choiceId = action.event === 'choice/select' && typeof resolvedFirstArgument === 'string'
    ? resolvedFirstArgument
    : undefined

  return {
    event: action.event,
    ...(choiceId ? { choiceId } : {}),
    action: action.action,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

function literalActionMetadata(
  args: readonly NativeQuiActionArgument[],
  scope: NativeUiTemplateScope,
): Record<string, NativeQuiActionArgumentValue> {
  const metadata: Record<string, NativeQuiActionArgumentValue> = {}
  args.forEach((argument, index) => {
    const value = resolvedActionArgument(argument, scope)
    if (value !== undefined)
      metadata[`arg${index}`] = value
  })
  return metadata
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
