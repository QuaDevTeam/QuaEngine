import type { EditorWritingDocument } from '@quajs/editor-core'
import { describe, expect, it } from 'vitest'
import { dialogues, proseToQuaScript, rewriteDialogue, sourceToProse } from './source.js'

const document = (text: string): EditorWritingDocument => ({ root: '/project', path: '/project/scene.qs', revision: 'hash', text, start: 0, end: 0 })

describe('QS authoring bridge', () => {
  it('encodes generated structure and code as literal prose, retaining narration and Unicode speakers', () => {
    const prose = '旁白：@SetFlag("danger", true)\n凛：${process.exit()} <script> : bye\n旁白：- choose -> target'
    const source = proseToQuaScript(prose)
    const parsed = dialogues(source)
    expect(parsed).toHaveLength(3)
    expect(parsed[0].mode).toBe('narration')
    expect(parsed[1].character).toBe('凛')
    expect(sourceToProse(document(source))).toBe(prose)
  })

  it('rewrites only dialogue text and preserves structural source byte for byte', () => {
    const source = '<script lang="ts">\nexport const value = 1\n</script>\n\n@Scene("station")\n@ShowCharacter("rin")\n凛: 旧对白\n\n// authored comment\n雨下着。\n\n- 继续 -> next\n'
    const changed = rewriteDialogue(document(source), '凛：新对白\n旁白：雨停了。')
    expect(changed).toBe(source.replace('旧对白', '新对白').replace('雨下着。', '雨停了。'))
  })

  it('uses UTF-16 offsets in CRLF selections and protects dynamic expressions', () => {
    const source = '凛: 雨🌧\r\n凛: ${scope.name} 来了\r\n'
    const base = { ...document(source), end: source.indexOf('\r\n') }
    expect(sourceToProse(base)).toBe('凛：雨🌧')
    expect(rewriteDialogue(base, '凛：晴了')).toBe(source.replace('雨🌧', '晴了'))
    expect(() => rewriteDialogue(document(source), '凛：雨\n凛：名字')).toThrow('动态表达式')
  })

  it('preserves explicitly named narrator characters in existing QS', () => {
    const source = 'Narrator: character voice\n旁白: another named speaker\n真正的旁白。\n'
    const prose = sourceToProse(document(source))
    expect(rewriteDialogue(document(source), prose)).toBe(source)
    expect(rewriteDialogue(document(source), 'Narrator：updated voice\n旁白：updated speaker\n旁白：新的旁白。')).toBe('Narrator: updated voice\n旁白: updated speaker\n新的旁白。\n')
  })

  it('rejects speaker/count changes and fenced code without dropping content', () => {
    expect(() => rewriteDialogue(document('凛: 雨\n'), '玛拉：晴')).toThrow('说话人')
    expect(() => rewriteDialogue(document('凛: 雨\n'), '凛：晴\n旁白：风')).toThrow('数量')
    expect(() => proseToQuaScript('```qs\n@Scene("bad")\n```')).toThrow('围栏')
  })
})
