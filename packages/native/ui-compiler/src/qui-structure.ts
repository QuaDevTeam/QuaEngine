import type { NativeQuiAstNode, NativeQuiProp, NativeUiDiagnostic } from './types'
import { collectQuiActionDescriptors } from './qui-actions'
import { collectQuiPropsFromGroup } from './qui-props'
import { findNativeUiComponent } from './registry'
import { findMatchingDelimiter, rangeFromOffsets } from './source'

interface QuiStructureNode extends NativeQuiAstNode {
  bodyEnd?: number
  bodyStart?: number
}

interface ParsedNode {
  next: number
  node: QuiStructureNode
}

export function validateQuiStructure(
  source: string,
  masked: string,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): void {
  const nodes = parseQuiStructureTree(source, masked, lineStarts)
  for (const node of nodes)
    validateNode(node, undefined, source, masked, diagnostics)
}

export function parseQuiStructureTree(
  source: string,
  masked: string,
  lineStarts: readonly number[],
): NativeQuiAstNode[] {
  return parseStructureRange(source, masked, lineStarts, 0, masked.length)
}

function parseStructureRange(
  source: string,
  masked: string,
  lineStarts: readonly number[],
  start: number,
  end: number,
): QuiStructureNode[] {
  const nodes: QuiStructureNode[] = []
  let offset = start

  while (offset < end) {
    if (isSlotStart(masked, offset)) {
      const parsed = parseSlot(source, masked, lineStarts, offset, end)
      if (parsed) {
        nodes.push(parsed.node)
        offset = parsed.next
        continue
      }
    }

    if (isComponentStart(masked, offset)) {
      const parsed = parseComponent(source, masked, lineStarts, offset, end)
      if (parsed) {
        nodes.push(parsed.node)
        offset = parsed.next
        continue
      }
    }

    offset += 1
  }

  return nodes
}

function parseComponent(
  source: string,
  masked: string,
  lineStarts: readonly number[],
  offset: number,
  end: number,
): ParsedNode | undefined {
  const name = readIdentifier(masked, offset)
  if (!name)
    return undefined

  let cursor = offset + name.length
  const classes: string[] = []
  while (masked[cursor] === '.') {
    const className = readIdentifier(masked, cursor + 1)
    if (!className)
      break
    classes.push(className)
    cursor += className.length + 1
  }

  cursor = skipWhitespace(masked, cursor, end)
  const hasProps = masked[cursor] === '('
  let props: NativeQuiProp[] = []
  if (hasProps) {
    const propsEnd = findMatchingDelimiter(masked, cursor, '(', ')')
    if (propsEnd === -1)
      return undefined
    props = collectQuiPropsFromGroup(source, lineStarts, cursor + 1, propsEnd)
    cursor = skipWhitespace(masked, propsEnd + 1, end)
  }

  const knownComponent = findNativeUiComponent(name)
  if (masked[cursor] !== '{') {
    if (!knownComponent && !hasProps)
      return undefined

    return {
      next: cursor,
      node: {
        children: [],
        actions: collectQuiActionDescriptors(props),
        classes,
        kind: 'component',
        name,
        nameRange: rangeFromOffsets(lineStarts, offset, offset + name.length),
        props,
        range: rangeFromOffsets(lineStarts, offset, cursor),
      },
    }
  }

  const bodyStart = cursor + 1
  const bodyEnd = findMatchingDelimiter(masked, cursor, '{', '}')
  if (bodyEnd === -1)
    return undefined

  const shouldParseChildren = knownComponent?.content !== 'none' && knownComponent?.content !== 'text'
  const children = shouldParseChildren
    ? parseStructureRange(source, masked, lineStarts, bodyStart, bodyEnd)
    : []

  return {
    next: bodyEnd + 1,
    node: {
      bodyEnd,
      bodyRange: rangeFromOffsets(lineStarts, bodyStart, bodyEnd),
      bodyStart,
      children,
      actions: collectQuiActionDescriptors(props),
      classes,
      kind: 'component',
      name,
      nameRange: rangeFromOffsets(lineStarts, offset, offset + name.length),
      props,
      range: rangeFromOffsets(lineStarts, offset, bodyEnd + 1),
    },
  }
}

function parseSlot(
  source: string,
  masked: string,
  lineStarts: readonly number[],
  offset: number,
  end: number,
): ParsedNode | undefined {
  let cursor = skipWhitespace(masked, offset + 'slot'.length, end)
  const nameStart = cursor
  const name = readIdentifier(masked, cursor)
  if (!name)
    return undefined

  cursor = skipWhitespace(masked, cursor + name.length, end)
  if (masked[cursor] !== '{')
    return undefined

  const bodyStart = cursor + 1
  const bodyEnd = findMatchingDelimiter(masked, cursor, '{', '}')
  if (bodyEnd === -1)
    return undefined

  return {
    next: bodyEnd + 1,
    node: {
      bodyEnd,
      bodyRange: rangeFromOffsets(lineStarts, bodyStart, bodyEnd),
      bodyStart,
      children: parseStructureRange(source, masked, lineStarts, bodyStart, bodyEnd),
      actions: [],
      classes: [],
      kind: 'slot',
      name,
      nameRange: rangeFromOffsets(lineStarts, nameStart, nameStart + name.length),
      props: [],
      range: rangeFromOffsets(lineStarts, offset, bodyEnd + 1),
    },
  }
}

function validateNode(
  node: QuiStructureNode,
  parentComponent: QuiStructureNode | undefined,
  source: string,
  masked: string,
  diagnostics: NativeUiDiagnostic[],
): void {
  if (node.kind === 'slot') {
    validateSlotNode(node, parentComponent, diagnostics)
    for (const child of node.children)
      validateNode(child, undefined, source, masked, diagnostics)
    return
  }

  validateComponentContent(node, source, masked, diagnostics)
  validateComponentSlots(node, diagnostics)

  for (const child of node.children)
    validateNode(child, node, source, masked, diagnostics)
}

function validateComponentContent(
  node: QuiStructureNode,
  source: string,
  masked: string,
  diagnostics: NativeUiDiagnostic[],
): void {
  const component = findNativeUiComponent(node.name)
  if (!component || node.bodyStart === undefined || node.bodyEnd === undefined)
    return

  if (component.content === 'none' && source.slice(node.bodyStart, node.bodyEnd).trim()) {
    diagnostics.push({
      code: 'QUI_INVALID_CHILDREN',
      message: `${node.name} is a leaf QUI component and must not declare child content.`,
      range: node.bodyRange,
      severity: 'error',
      source: 'qui',
    })
  }

  if (component.content === 'text' && containsStructureToken(masked, node.bodyStart, node.bodyEnd)) {
    diagnostics.push({
      code: 'QUI_INVALID_CHILDREN',
      message: `${node.name} may contain text or expression content only, not nested QUI components or slots.`,
      range: node.bodyRange,
      severity: 'error',
      source: 'qui',
    })
  }
}

function validateComponentSlots(node: QuiStructureNode, diagnostics: NativeUiDiagnostic[]): void {
  const seenSlots = new Set<string>()
  for (const child of node.children) {
    if (child.kind !== 'slot')
      continue
    if (!seenSlots.has(child.name)) {
      seenSlots.add(child.name)
      continue
    }

    diagnostics.push({
      code: 'QUI_DUPLICATE_SLOT',
      message: `The "${child.name}" slot is declared more than once on ${node.name}.`,
      range: child.range,
      severity: 'error',
      source: 'qui',
    })
  }
}

function validateSlotNode(
  node: QuiStructureNode,
  parentComponent: QuiStructureNode | undefined,
  diagnostics: NativeUiDiagnostic[],
): void {
  if (!parentComponent) {
    diagnostics.push({
      code: 'QUI_SLOT_ORPHANED',
      message: 'Named slot blocks must be direct children of a component.',
      range: node.range,
      severity: 'error',
      source: 'qui',
    })
    return
  }

  const component = findNativeUiComponent(parentComponent.name)
  if (!component || component.slots?.includes(node.name))
    return

  diagnostics.push({
    code: 'QUI_UNKNOWN_SLOT',
    message: `${parentComponent.name} does not declare a "${node.name}" slot.`,
    range: node.range,
    severity: 'error',
    source: 'qui',
  })
}

function containsStructureToken(masked: string, start: number, end: number): boolean {
  let offset = start
  while (offset < end) {
    if (isSlotStart(masked, offset) || looksLikeComponentNode(masked, offset, end))
      return true
    offset += 1
  }
  return false
}

function looksLikeComponentNode(masked: string, offset: number, end: number): boolean {
  if (!isComponentStart(masked, offset))
    return false

  const name = readIdentifier(masked, offset)
  if (!name || !findNativeUiComponent(name))
    return false

  let cursor = offset + name.length
  while (masked[cursor] === '.') {
    const className = readIdentifier(masked, cursor + 1)
    if (!className)
      break
    cursor += className.length + 1
  }

  cursor = skipWhitespace(masked, cursor, end)
  if (masked[cursor] === '(') {
    const propsEnd = findMatchingDelimiter(masked, cursor, '(', ')')
    if (propsEnd === -1)
      return false
    cursor = skipWhitespace(masked, propsEnd + 1, end)
    return true
  }

  return masked[cursor] === '{'
}

function isComponentStart(masked: string, offset: number): boolean {
  const char = masked[offset]
  const previous = masked[offset - 1] || ''
  return /[A-Z]/.test(char) && !/[A-Za-z0-9_.$-]/.test(previous)
}

function isSlotStart(masked: string, offset: number): boolean {
  return masked.slice(offset, offset + 4) === 'slot'
    && !/[A-Za-z0-9_-]/.test(masked[offset - 1] || '')
    && !/[A-Za-z0-9_-]/.test(masked[offset + 4] || '')
}

function readIdentifier(masked: string, offset: number): string | undefined {
  const match = /^[A-Za-z_][\w-]*/.exec(masked.slice(offset))
  return match?.[0]
}

function skipWhitespace(masked: string, offset: number, end: number): number {
  let cursor = offset
  while (cursor < end && /\s/.test(masked[cursor]))
    cursor += 1
  return cursor
}
