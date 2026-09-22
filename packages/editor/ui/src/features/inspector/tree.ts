import type { PreviewInspectorNode } from '@quajs/editor-core'
import { element, html } from '@quajs/editor-controls'

export interface InspectorEntry {
  node: PreviewInspectorNode
  parent?: number
  depth: number
  children: number[]
  inlineText?: string
}
export interface InspectorRow {
  entry: InspectorEntry
  closing: boolean
  expanded: boolean
  position: number
  siblings: number
}

/** CDP identities survive sibling insertion and reordering within a document. */
export function indexInspectorTree(root: PreviewInspectorNode): Map<number, InspectorEntry> {
  const entries = new Map<number, InspectorEntry>()
  const visit = (node: PreviewInspectorNode, depth: number, parent?: number): void => {
    const children = node.children.filter(child => child.nodeType !== 3 || child.value.trim())
    const text = children.length === 1 && children[0].nodeType === 3 ? children[0].value : undefined
    const inlineText = node.nodeType === 1 && text && text.length <= 120 && !text.includes('\n') ? text : undefined
    const visible = inlineText ? [] : children
    entries.set(node.nodeId, { node, parent, depth, children: visible.map(child => child.nodeId), inlineText })
    visible.forEach(child => visit(child, depth + 1, node.nodeId))
  }
  visit(root, 0)
  return entries
}

export function flattenInspectorTree(entries: Map<number, InspectorEntry>, collapsed: Set<number>, query: string): InspectorRow[] {
  const needle = query.trim().toLocaleLowerCase()
  const included = new Set<number>()
  if (needle) {
    for (const entry of entries.values()) {
      const { node } = entry
      if (!`${node.name} ${node.value} ${entry.inlineText || ''} ${Object.entries(node.attributes).flat().join(' ')}`.toLocaleLowerCase().includes(needle))
        continue
      let current: InspectorEntry | undefined = entry
      while (current && !included.has(current.node.nodeId)) {
        included.add(current.node.nodeId)
        current = current.parent === undefined ? undefined : entries.get(current.parent)
      }
    }
  }
  const rows: InspectorRow[] = []
  const visit = (ids: number[]): void => {
    const visible = needle ? ids.filter(id => included.has(id)) : ids
    visible.forEach((id, index) => {
      const entry = entries.get(id)!
      const expanded = entry.children.length > 0 && (Boolean(needle) || !collapsed.has(id))
      const row = { entry, expanded, closing: false, position: index + 1, siblings: visible.length }
      rows.push(row)
      if (expanded) {
        visit(entry.children)
        if (entry.node.nodeType === 1)
          rows.push({ ...row, closing: true })
      }
    })
  }
  visit([...entries.values()].filter(entry => entry.parent === undefined).map(entry => entry.node.nodeId))
  return rows
}

export function inspectorNodeLabel(node: PreviewInspectorNode): string {
  if (node.shadowRootType)
    return `#shadow-root (${node.shadowRootType})`
  return `${node.name}${node.attributes.id ? `#${node.attributes.id}` : ''}${node.attributes.class ? `.${node.attributes.class.trim().split(/\s+/u).join('.')}` : ''}`
}

const htmlVoidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

/** Safe DOM tokens: inspected markup is data, never executable HTML. */
export function renderInspectorLabel(row: InspectorRow, web: boolean): HTMLElement {
  const { node, inlineText } = row.entry
  const tokens: { text: string, kind: string }[] = []
  const append = (text: string, kind: string): void => {
    tokens.push({ text, kind })
  }
  const tag = (closing = false): void => {
    append(closing ? '</' : '<', 'punctuation')
    append(node.name, 'tag')
  }
  if (node.nodeType === 3) {
    append(`"${previewText(node.value)}"`, 'text')
  }
  else if (node.nodeType === 8) {
    append(`<!--${previewText(node.value)}-->`, 'comment')
  }
  else if (node.nodeType === 10) {
    append(`<!DOCTYPE ${node.name}>`, 'comment')
  }
  else if (node.nodeType !== 1) {
    append(inspectorNodeLabel(node), 'document')
  }
  else if (row.closing) {
    tag(true)
    append('>', 'punctuation')
  }
  else {
    tag()
    const attributes = Object.entries(node.attributes).sort(([a], [b]) => attributePriority(a) - attributePriority(b))
    for (const [name, value] of attributes.slice(0, 8)) {
      append(` ${name}`, 'attribute')
      append('=', 'punctuation')
      append(`"${previewText(value)}"`, 'value')
    }
    if (attributes.length > 8)
      append(' …', 'ellipsis')
    append('>', 'punctuation')
    if (row.expanded && node.value)
      append(previewText(node.value), 'text')
    if (!row.expanded) {
      if (row.entry.children.length)
        append('…', 'ellipsis')
      else if (inlineText || node.value)
        append(previewText(inlineText || node.value), 'text')
      if (!(web && htmlVoidElements.has(node.name.toLowerCase()))) {
        tag(true)
        append('>', 'punctuation')
      }
    }
  }
  return element(html`<span class="inspector-markup">${tokens.map(token => html`<span class=${`inspector-${token.kind}`}>${token.text}</span>`)}</span>`)
}

function attributePriority(name: string): number {
  return name === 'id' ? 0 : name === 'class' ? 1 : 2
}

function previewText(value: string): string {
  const line = value.replace(/[\r\n\t]/gu, ' ')
  return line.length > 180 ? `${line.slice(0, 180)}…` : line
}
