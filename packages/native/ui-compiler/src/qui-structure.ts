import type { NativeUiDiagnostic } from './types'
import {
  isComponentStart,
  isSlotStart,
  parseQuiStructureTree,
  readIdentifier,
  skipWhitespace,
  type QuiStructureNode,
} from './qui-structure-parser'
import { findNativeUiComponent } from './registry'
import { findMatchingDelimiter } from './source'

export { parseQuiStructureTree } from './qui-structure-parser'

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
