import type { EditorWritingDocument, EditorWritingPlan } from '@quajs/editor-core'
import { describe, expect, it } from 'vitest'
import { adaptationInput, applyAdaptation } from './adaptation'
import { dialogues, sourceToProse } from './source'

const base = (text: string): EditorWritingDocument => ({ root: '/project', path: '/project/a.qs', revision: 'disk', text, start: 0, end: 0 })
const plan = (anchors: number[]): EditorWritingPlan => ({ summary: '按原故事位置适配。', assignments: anchors.map((anchor, line) => ({ anchor, line, expressions: [] })) })

describe('anchored writing adaptation', () => {
  it('inserts, deletes and changes speakers while preserving TS, comments, branching and stage directions', () => {
    const source = '<script lang="ts">\nexport const value = 1\n</script>\n@Node("start")\n凛: 原第一句\n删掉这句\n// direction\n- 等待 -> next if scope.wait\n@Node("next")\n凛: 原最后一句\n'
    const result = applyAdaptation(base(source), '凛：新的第一句\n玛拉：新增回应\n旁白：新的最后一段', plan([0, 0, 2]))
    expect(result.text).toBe(source.replace('凛: 原第一句', '凛: 新的第一句\n玛拉: 新增回应').replace('删掉这句', '').replace('凛: 原最后一句', '新的最后一段'))
    expect(dialogues(result.text)).toHaveLength(3)
  })
  it('preserves runtime expressions and their evaluation order using UTF-16 manuscript spans', () => {
    const source = '凛: 你好 ${scope.name}，余额 ${scope.balance()}\n'
    const input = '🌧小明，还有十元。'
    const value = plan([0, 0])
    value.assignments[0].expressions = [
      { expression: 0, start: input.indexOf('小明'), end: input.indexOf('小明') + 2 },
      { expression: 1, start: input.indexOf('十元'), end: input.indexOf('十元') + 2 },
    ]
    const result = applyAdaptation(base(source), `凛：${input}\n旁白：他合上账本。`, value)
    expect(result.text).toBe('凛: 🌧${scope.name}，还有${scope.balance()}。\n他合上账本。\n')
    expect(dialogues(result.text)[0].templateExpressions).toEqual(['scope.name', 'scope.balance()'])
  })
  it('edits only complete selected dialogue with CRLF and returns updated selection for the next revision', () => {
    const source = '前文🌧\r\n  凛: 中间\r\n后文\r\n'
    const document = { ...base(source), start: source.indexOf('  凛'), end: source.indexOf('\r\n后文') }
    const result = applyAdaptation(document, '凛：新增一句\n旁白：续句', plan([0, 0]))
    expect(result.text).toBe('前文🌧\r\n  凛: 新增一句\r\n  续句\r\n后文\r\n')
    expect(sourceToProse({ ...document, text: result.text, ...result.selection })).toBe('凛：新增一句\n旁白：续句')
    expect(applyAdaptation({ ...document, text: result.text, ...result.selection }, '凛：合并一句', plan([0])).text).toBe('前文🌧\r\n  凛: 合并一句\r\n\r\n后文\r\n')
  })
  it('never executes code-looking manuscript or accepts executable model edits', () => {
    const document = base('凛: 原稿\n')
    const result = applyAdaptation(document, '凛：${scope.erase()} <script lang="ts">', plan([0]))
    expect(sourceToProse(base(result.text))).toContain('${scope.erase()} <script lang="ts">')
    expect(dialogues(result.text)[0].templateExpressions.every(item => typeof JSON.parse(item) === 'string')).toBe(true)
    expect(() => applyAdaptation(document, '凛：新稿', { ...plan([0]), code: 'evil' })).toThrow()
  })
  it('rejects dropped/duplicated paragraphs, unknown anchors and backward execution mapping', () => {
    const document = base('甲: 一\n乙: 二\n')
    expect(() => applyAdaptation(document, '甲：三\n乙：四', plan([0]))).toThrow('每一段')
    expect(() => applyAdaptation(document, '甲：三\n乙：四', plan([1, 0]))).toThrow('顺序')
    expect(() => applyAdaptation(document, '甲：三', plan([2]))).toThrow('锚点')
    const duplicate = plan([0, 1]); duplicate.assignments[1].line = 0
    expect(() => applyAdaptation(document, '甲：三\n乙：四', duplicate)).toThrow('顺序')
  })
  it('rejects deleting protected checkpoints or emptying entire control-flow zones', () => {
    expect(() => applyAdaptation(base('@Node("a")\n甲: 一\n甲: 二'), '甲：三', plan([1]))).toThrow('执行位置')
    const document = base('甲: 选择前\n- 走 -> end\n甲: 选择后')
    expect(adaptationInput(document, '甲：新').anchors.map(anchor => anchor.zone)).toEqual([0, 1])
    expect(() => applyAdaptation(document, '甲：新', plan([0]))).toThrow('逻辑区间')
  })
  it('rejects lost, reordered or moved dynamic expressions and invalid Unicode spans', () => {
    const document = base('甲: ${scope.name}\n')
    expect(() => applyAdaptation(document, '甲：名字', plan([0]))).toThrow('表达式')
    const value = plan([0]); value.assignments[0].expressions = [{ expression: 0, start: 1, end: 2 }]
    expect(() => applyAdaptation(document, '甲：🌧名字', value)).toThrow('范围')
  })
  it('allows repeated editing of escaped literal segments alongside runtime expressions', () => {
    const document = base('凛: ${scope.name}，你好\n')
    const value = plan([0]); value.assignments[0].expressions = [{ expression: 0, start: 3, end: 5 }]
    const first = applyAdaptation(document, '凛：姓名：小明，欢迎', value)
    expect(sourceToProse(base(first.text))).toBe('凛：姓名：${scope.name}，欢迎')
    expect(adaptationInput(base(first.text), '凛：名字：小明，您好').anchors[0].expressions).toEqual(['scope.name'])
    const second = applyAdaptation(base(first.text), '凛：名字：小明，您好', value)
    expect(sourceToProse(base(second.text))).toBe('凛：名字：${scope.name}，您好')
  })
  it('roundtrips explicit narrator character names without changing their identity', () => {
    const document = base('Narrator: hello\n旁白: 我是角色\n这是叙述\n')
    expect(applyAdaptation(document, sourceToProse(document), plan([0, 1, 2])).text).toBe(document.text)
  })
})
