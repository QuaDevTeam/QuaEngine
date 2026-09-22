import { describe, expect, it } from 'vitest'
import { contextBlocks } from './context-document'

describe('project context document', () => {
  it('retains character descriptions as text and preserves story nesting', () => {
    expect(contextBlocks('## 凛\n性格：沉默而谨慎\n关系：与妹妹相依为命\n\n- 车站\n  - 到达\n    - 等待\n  - 离开\n- 尾声')).toEqual([
      { type: 'heading', level: 2, text: '凛' },
      { type: 'paragraph', text: '性格：沉默而谨慎\n关系：与妹妹相依为命' },
      { type: 'list', ordered: false, items: [
        { text: '车站', children: [
          { text: '到达', children: [{ text: '等待', children: [] }] },
          { text: '离开', children: [] },
        ] },
        { text: '尾声', children: [] },
      ] },
    ])
  })
  it('keeps source examples and evidence notes separate from prose', () => {
    expect(contextBlocks('> 正文摘录\n\n```qs\n# literal\n凛：你好\n```\n\n<img onerror="alert(1)">')).toEqual([
      { type: 'quote', text: '正文摘录' },
      { type: 'code', text: '# literal\n凛：你好' },
      { type: 'paragraph', text: '<img onerror="alert(1)">' },
    ])
  })
})
