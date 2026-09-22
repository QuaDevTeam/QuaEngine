import { describe, expect, it } from 'vitest'
import { extractQuaScriptStoryDeclaration } from '../src/core/story-declaration'

describe('quaScript source outline', () => {
  it('uses real AST declarations, ranges and literal titles across script blocks and multiline metadata', () => {
    const source = [
      '<script lang="ts">',
      'const example = "@Node(\'fake\')"',
      '</script>',
      '// @Node("comment")',
      '@Chapter("01", { title: "第一章" })',
      '@Scene("room")',
      '  @Node(',
      '    "door",',
      '    { title: "门后的声音" }',
      '  )',
      '凛: 有人在吗？',
      '@Choice("敲门", undefined, { id: "knock" })',
      '@Choice("离开", undefined, { id: "leave" })',
      '',
      '@Node("door", { title: "另一处同名节点" })',
      '@Label("answer")',
      '回应传来。',
    ].join('\r\n')
    const outline = extractQuaScriptStoryDeclaration(source, { includeOutline: true }).outline!
    expect(outline.map(item => [item.kind, item.id, item.parent])).toEqual([
      ['chapter', '01', undefined],
      ['scene', 'room', 0],
      ['node', 'door', 1],
      ['choice', 'knock', 2],
      ['choice', 'leave', 2],
      ['node', 'door', 1],
      ['label', 'answer', 5],
    ])
    expect(outline[2].title).toBe('门后的声音')
    expect(outline[2].range.start).toMatchObject({ line: 6, column: 2 })
    expect(outline[5].range.start.line).toBe(14)
    for (const symbol of outline)
      expect(source.slice(symbol.range.start.offset, symbol.range.end.offset)).toMatch(/^@/)
    expect(extractQuaScriptStoryDeclaration(source)).not.toHaveProperty('outline')
  })
})
