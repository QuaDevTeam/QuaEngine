import type { PreviewInspectorNode } from '@quajs/editor-core'
import { describe, expect, it } from 'vitest'
import { flattenInspectorTree, indexInspectorTree, inspectorNodeLabel } from '../../ui/src/features/inspector/tree'

const element = (nodeId: number, name: string, children: PreviewInspectorNode[] = [], attributes = {}): PreviewInspectorNode => ({ nodeId, nodeType: 1, name, value: '', attributes, children })
const text = (nodeId: number, value: string): PreviewInspectorNode => ({ nodeId, nodeType: 3, name: '#text', value, attributes: {}, children: [] })

describe('devTools element tree projection', () => {
  it('inlines short text, hides whitespace, and pairs real element opening/closing rows', () => {
    const root = element(1, 'div', [text(2, '\n  '), element(3, 'span', [text(4, '邮件下面附了六张照片')]), element(5, 'article', [text(6, '长文本\n第二行')])])
    const entries = indexInspectorTree(root)
    expect(entries.has(2)).toBe(false)
    expect(entries.get(3)?.inlineText).toBe('邮件下面附了六张照片')
    expect(entries.get(3)?.children).toEqual([])
    expect(entries.get(5)?.children).toEqual([6])
    expect(flattenInspectorTree(entries, new Set(), '').map(row => [row.entry.node.nodeId, row.closing])).toEqual([[1, false], [3, false], [5, false], [6, false], [5, true], [1, true]])
  })

  it('retains parent context when searching attributes or inline text without erasing collapse state', () => {
    const entries = indexInspectorTree(element(1, 'section', [element(2, 'div', [text(3, 'six photos')], { 'data-role': 'dialogue' }), element(4, 'button')]))
    const collapsed = new Set([1])
    for (const query of ['six photos', 'data-role', 'dialogue']) {
      const rows = flattenInspectorTree(entries, collapsed, query)
      expect(rows.filter(row => !row.closing).map(row => row.entry.node.nodeId)).toEqual([1, 2])
      expect(rows[1]).toMatchObject({ position: 1, siblings: 1 })
    }
    expect([...collapsed]).toEqual([1])
    expect(flattenInspectorTree(entries, collapsed, '')).toHaveLength(1)
    expect(flattenInspectorTree(entries, collapsed, 'missing')).toEqual([])
  })

  it('uses CDP ids rather than sibling positions and labels shadow roots accurately', () => {
    const branch = element(3, 'div', [element(4, 'span')], { id: 'same' })
    const first = indexInspectorTree(element(1, 'body', [branch]))
    const next = indexInspectorTree(element(1, 'body', [element(2, 'div', [], { id: 'same' }), branch]))
    expect(next.get(3)?.parent).toBe(first.get(3)?.parent)
    expect(flattenInspectorTree(next, new Set([3]), '').some(row => row.entry.node.nodeId === 4)).toBe(false)
    expect(inspectorNodeLabel({ ...element(5, '#document-fragment'), nodeType: 11, shadowRootType: 'open' })).toBe('#shadow-root (open)')
  })
})
