import type { NativeQuiAstNode, NativeQuiProp } from './types'
import { collectQuiActionDescriptors } from './qui-actions'
import { collectQuiPropsFromGroup } from './qui-props'
import { findNativeUiComponent } from './registry'
import { findMatchingDelimiter, rangeFromOffsets } from './source'

export interface QuiStructureNode extends NativeQuiAstNode {
  bodyEnd?: number
  bodyStart?: number
}

interface ParsedNode {
  next: number
  node: QuiStructureNode
}

export function parseQuiStructureTree(
  source: string,
  masked: string,
  lineStarts: readonly number[],
): QuiStructureNode[] {
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

export function isComponentStart(masked: string, offset: number): boolean {
  const char = masked[offset]
  const previous = masked[offset - 1] || ''
  return /[A-Z]/.test(char) && !/[A-Za-z0-9_.$-]/.test(previous)
}

export function isSlotStart(masked: string, offset: number): boolean {
  return masked.slice(offset, offset + 4) === 'slot'
    && !/[A-Za-z0-9_-]/.test(masked[offset - 1] || '')
    && !/[A-Za-z0-9_-]/.test(masked[offset + 4] || '')
}

export function readIdentifier(masked: string, offset: number): string | undefined {
  const match = /^[A-Za-z_][\w-]*/.exec(masked.slice(offset))
  return match?.[0]
}

export function skipWhitespace(masked: string, offset: number, end: number): number {
  let cursor = offset
  while (cursor < end && /\s/.test(masked[cursor]))
    cursor += 1
  return cursor
}
