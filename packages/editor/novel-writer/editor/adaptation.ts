import type { EditorWritingDocument, EditorWritingPlan } from '@quajs/editor-core'
import type { QuaScriptDialogue } from '@quajs/script-compiler'
import { parseQuaScriptDocument, QuaScriptParser } from '@quajs/script-compiler'
import { z } from 'zod'
import { dialogues, dynamicExpressions, lines, literal, readable, selected } from './source.js'

export const writingDocumentSchema = z.object({
  root: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096).refine(value => value.endsWith('.qs')),
  revision: z.string().min(1).max(256),
  text: z.string().max(1048576),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).refine(value => value.start <= value.end && value.end <= value.text.length, '无效的源稿选区。')

export const writingPlanSchema = z.object({
  summary: z.string().min(1).max(4000),
  assignments: z.array(z.object({
    line: z.number().int().nonnegative(),
    anchor: z.number().int().nonnegative(),
    expressions: z.array(z.object({
      expression: z.number().int().nonnegative(),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    }).strict()).max(100),
  }).strict()).min(1).max(10000),
}).strict()

function expressions(item: QuaScriptDialogue): string[] {
  return dynamicExpressions(item)
}

/** Stable for the captured document. IDs are never inferred from repeated prose. */
export function adaptationInput(base: EditorWritingDocument, prose: string): {
  source: string
  selection: { start: number, end: number }
  anchors: Array<{ id: number, zone: number, line: number, speaker: string, text: string, expressions: string[], decorators: Array<{ name: string, args: unknown[] }>, required: boolean }>
  manuscript: Array<{ id: number, speaker: string, text: string }>
} {
  writingDocumentSchema.parse(base)
  const anchors = selected(base)
  if (!anchors.length) throw new Error('源稿没有完整对白，请重新取稿。')
  const parsed = new QuaScriptParser().parse(parseQuaScriptDocument(base.text).dslBody)
  let zone = 0
  const zones = new Map<number, number>()
  for (const step of parsed.steps) {
    if (step.type !== 'dialogue') { zone++; continue }
    const dialogue = step.content as QuaScriptDialogue
    if (dialogue.decorators.length) zone++
    zones.set(dialogue.textRange.start.offset, zone)
  }
  return {
    source: base.text,
    selection: { start: base.start, end: base.end },
    anchors: anchors.map((item, id) => ({
      id, zone: zones.get(item.textRange.start.offset)!, line: item.textRange.start.line + 1,
      speaker: item.character ?? '', text: readable(item),
      expressions: expressions(item),
      decorators: item.decorators.map(value => ({ name: value.name, args: value.args })),
      required: item.decorators.length > 0 || expressions(item).length > 0,
    })),
    manuscript: lines(prose, true).map((item, id) => ({ id, ...item })),
  }
}

/** Compare executable structure without source positions or generated step UUIDs. */
function logic(source: string): string {
  const document = parseQuaScriptDocument(source)
  const parsed = new QuaScriptParser().parse(document.dslBody)
  const strip = (key: string, value: unknown) => /^(?:range|.*Range|.*Ranges|uuid)$/u.test(key) ? undefined : value
  return JSON.stringify(parsed.steps.flatMap<unknown>((step) => {
    if (step.type !== 'dialogue') return [step.content]
    const item = step.content as QuaScriptDialogue
    return item.decorators.length ? [{ type: 'dialogue', decorators: item.decorators }] : []
  }), strip)
}

function isBoundary(value: string, offset: number): boolean {
  return !(offset > 0 && offset < value.length && /[\uD800-\uDBFF]/u.test(value[offset - 1]) && /[\uDC00-\uDFFF]/u.test(value[offset]))
}

/** Rebuild only selected dialogue bodies. Branches, TS, comments and decorators stay byte-identical. */
export function applyAdaptation(base: EditorWritingDocument, prose: string, value: unknown): { text: string, selection: { start: number, end: number } } {
  const plan: EditorWritingPlan = writingPlanSchema.parse(value)
  const input = adaptationInput(base, prose)
  const anchors = selected(base)
  if (plan.assignments.length !== input.manuscript.length) throw new Error('适配必须包含每一段稿件，不能遗漏或重复。')
  let previousAnchor = -1
  const rendered = anchors.map(() => [] as string[])
  for (const [index, assignment] of plan.assignments.entries()) {
    if (assignment.line !== index || assignment.anchor < previousAnchor || assignment.anchor >= anchors.length)
      throw new Error('稿件顺序或源码锚点无效；不能跨越原有逻辑重排段落。')
    previousAnchor = assignment.anchor
    const anchor = anchors[assignment.anchor]
    const item = input.manuscript[index]
    const first = !rendered[assignment.anchor].length
    const dynamic = first ? expressions(anchor) : []
    if (assignment.expressions.length !== dynamic.length)
      throw new Error(`锚点 ${assignment.anchor} 必须在首段保留全部动态表达式及其求值顺序。`)
    let offset = 0
    let text = ''
    for (const [expressionIndex, replacement] of assignment.expressions.entries()) {
      if (replacement.expression !== expressionIndex || replacement.start < offset || replacement.end < replacement.start || replacement.end > item.text.length
        || !isBoundary(item.text, replacement.start) || !isBoundary(item.text, replacement.end))
        throw new Error(`锚点 ${assignment.anchor} 的动态变量替换范围无效。`)
      if (replacement.start > offset) text += literal(item.text.slice(offset, replacement.start))
      text += `\${${dynamic[expressionIndex]}}`
      offset = replacement.end
    }
    if (offset < item.text.length) text += literal(item.text.slice(offset))
    const speaker = /^(?:旁白|narration|narrator)$/iu.test(item.speaker) && item.speaker !== anchor.character ? '' : item.speaker
    const line = `${speaker ? `${speaker}: ` : ''}${text}`
    const parsed = dialogues(line)
    if (parsed.length !== 1 || (parsed[0].character ?? '') !== speaker)
      throw new Error('适配结果不是有效的单段对白。')
    // JSON string encodings are literal; only expressions from the captured source can execute.
    if (JSON.stringify(dynamicExpressions(parsed[0])) !== JSON.stringify(dynamic))
      throw new Error('动态表达式发生了非预期变化。')
    rendered[assignment.anchor].push(line)
  }
  for (const zone of new Set(input.anchors.map(anchor => anchor.zone))) {
    if (!input.anchors.some(anchor => anchor.zone === zone && rendered[anchor.id].length))
      throw new Error(`逻辑区间 ${zone} 的正文全部被移走；需要在该分支/演出区间保留对应新稿。`)
  }
  const newline = base.text.includes('\r\n') ? '\r\n' : '\n'
  let text = base.text
  let delta = 0
  for (let index = anchors.length - 1; index >= 0; index--) {
    const anchor = anchors[index]
    if (!rendered[index].length && input.anchors[index].required)
      throw new Error(`锚点 ${index} 带有演出、故事标记或动态变量；AI 需把相应新段落安排到这里，不能删除其执行位置。`)
    const start = anchor.range!.start.offset
    const end = anchor.textRange.end.offset
    const indent = /^\s*/u.exec(base.text.slice(start, anchor.textRange.start.offset))?.[0] ?? ''
    const replacement = rendered[index].map(line => `${indent}${line}`).join(newline)
    delta += replacement.length - (end - start)
    text = text.slice(0, start) + replacement + text.slice(end)
  }
  if (text.length > 1048576) throw new Error('结果超过文档大小上限。')
  dialogues(text)
  if (logic(text) !== logic(base.text)) throw new Error('适配改变了分支或演出指令的执行结构。')
  return {
    text,
    selection: base.start === base.end ? { start: 0, end: 0 } : {
      start: anchors[0].range!.start.offset,
      end: anchors.at(-1)!.textRange.end.offset + delta,
    },
  }
}
