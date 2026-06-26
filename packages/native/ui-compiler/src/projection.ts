import type {
  NativeQssDocument,
  NativeQssResolvedBounds,
  NativeQssRule,
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
import { findNativeUiComponent } from './registry'
import { resolveNativeQssDeclarations } from './qss-resolved-style'
import { splitTopLevel } from './source'

export interface CompileNativeUiSurfaceProjectionOptions {
  contentPackageId?: string
  qss?: NativeQssDocument | readonly NativeQssDocument[]
  requiredRuntimePackages?: readonly string[]
  rootId?: string
}

interface QuiNodeContext {
  ancestors: readonly NativeQuiAstNode[]
  node: NativeQuiAstNode
}

interface QuiProjectionContext {
  ancestors: readonly NativeQuiAstNode[]
  parentBounds?: NativeUiSurfaceRect
}

interface SelectorSegment {
  classes: string[]
  component?: string
  id?: string
}

interface SelectorChain {
  direct: boolean[]
  segments: SelectorSegment[]
  specificity: number
}

interface MatchedRule {
  order: number
  rule: NativeQssRule
  specificity: number
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

function resolveStyleForNode(
  context: QuiNodeContext,
  qssDocuments: readonly NativeQssDocument[],
) {
  const matched = qssDocuments
    .flatMap(document => document.rules)
    .flatMap((rule, order): MatchedRule[] => matchingSpecificities(context, rule)
      .map(specificity => ({ rule, order, specificity })))
    .sort((left, right) => left.specificity - right.specificity || left.order - right.order)
  const declarations = matched.flatMap(item => item.rule.declarations)
  return resolveNativeQssDeclarations(declarations)
}

function matchingSpecificities(context: QuiNodeContext, rule: NativeQssRule): number[] {
  return splitTopLevel(rule.selector, ',')
    .map(item => parseSelectorChain(item.text.trim()))
    .filter((chain): chain is SelectorChain => Boolean(chain))
    .filter(chain => matchesSelectorChain(context, chain))
    .map(chain => chain.specificity)
}

function parseSelectorChain(selector: string): SelectorChain | undefined {
  if (!selector || selector.includes('::') || selector.includes(':') || selector.includes('['))
    return undefined

  const normalized = selector.replace(/\s*>\s*/g, ' > ').trim()
  const rawParts = normalized.split(/\s+/).filter(Boolean)
  if (rawParts.length === 0 || rawParts.includes('*'))
    return undefined

  const segments: SelectorSegment[] = []
  const direct: boolean[] = []
  let nextDirect = false
  for (const part of rawParts) {
    if (part === '>') {
      if (segments.length === 0 || nextDirect)
        return undefined
      nextDirect = true
      continue
    }

    const segment = parseSelectorSegment(part)
    if (!segment)
      return undefined

    segments.push(segment)
    if (segments.length > 1)
      direct.push(nextDirect)
    nextDirect = false
  }

  return segments.length > 0 && !nextDirect
    ? { segments, direct, specificity: selectorSpecificity(segments) }
    : undefined
}

function parseSelectorSegment(source: string): SelectorSegment | undefined {
  const component = /^[A-Z][A-Za-z0-9_]*/.exec(source)?.[0]
  let cursor = component?.length ?? 0
  const segment: SelectorSegment = { classes: [] }
  if (component)
    segment.component = component

  while (cursor < source.length) {
    const prefix = source[cursor]
    const match = /^[-_A-Za-z][\w-]*/.exec(source.slice(cursor + 1))
    if (!match)
      return undefined

    if (prefix === '.') {
      segment.classes.push(match[0])
    }
    else if (prefix === '#') {
      if (segment.id)
        return undefined
      segment.id = match[0]
    }
    else {
      return undefined
    }
    cursor += match[0].length + 1
  }

  return segment.component || segment.id || segment.classes.length > 0 ? segment : undefined
}

function selectorSpecificity(segments: readonly SelectorSegment[]): number {
  return segments.reduce((total, segment) => {
    const id = segment.id ? 100 : 0
    const classes = segment.classes.length * 10
    const component = segment.component ? 1 : 0
    return total + id + classes + component
  }, 0)
}

function matchesSelectorChain(context: QuiNodeContext, chain: SelectorChain): boolean {
  const last = chain.segments[chain.segments.length - 1]
  if (!matchesSegment(context.node, last))
    return false

  let ancestorIndex = context.ancestors.length - 1
  for (let segmentIndex = chain.segments.length - 2; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = chain.segments[segmentIndex]
    const mustBeDirect = chain.direct[segmentIndex]

    if (mustBeDirect) {
      if (ancestorIndex < 0 || !matchesSegment(context.ancestors[ancestorIndex], segment))
        return false
      ancestorIndex -= 1
      continue
    }

    let matched = false
    while (ancestorIndex >= 0) {
      if (matchesSegment(context.ancestors[ancestorIndex], segment)) {
        matched = true
        ancestorIndex -= 1
        break
      }
      ancestorIndex -= 1
    }
    if (!matched)
      return false
  }

  return true
}

function matchesSegment(node: NativeQuiAstNode, segment: SelectorSegment): boolean {
  if (node.kind !== 'component')
    return false
  if (segment.component && node.name !== segment.component)
    return false
  if (segment.id && propString(node.props, 'id') !== segment.id)
    return false
  return segment.classes.every(className => node.classes.includes(className))
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
  const src = propString(props, 'src') || propString(props, 'image')
  return src ? { assetType: propString(props, 'asset-type') || 'images', assetName: src } : undefined
}

function intentFromNode(node: NativeQuiAstNode): NativeUiSurfaceIntentProjection | undefined {
  const action = node.actions[0]
  if (!action)
    return undefined

  const metadata = literalActionMetadata(action.arguments)
  const firstArgument = action.arguments[0]
  if (action.event === 'choice/select' && firstArgument?.kind === 'literal' && typeof firstArgument.value === 'string')
    metadata.choiceId = firstArgument.value

  return {
    event: action.event,
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

function propString(props: readonly NativeQuiProp[], name: string): string | undefined {
  const value = props.find(prop => prop.name === name)?.value?.trim()
  if (!value)
    return undefined
  return stripQuotes(value)
}

function numberProp(props: readonly NativeQuiProp[], name: string): number | undefined {
  const value = propString(props, name)
  if (!value)
    return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function booleanProp(props: readonly NativeQuiProp[], name: string): boolean | undefined {
  const value = propString(props, name)
  if (!value)
    return undefined
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return undefined
}

function stripQuotes(value: string): string {
  const quote = value[0]
  return (quote === '"' || quote === '\'') && value[value.length - 1] === quote
    ? value.slice(1, -1)
    : value
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
