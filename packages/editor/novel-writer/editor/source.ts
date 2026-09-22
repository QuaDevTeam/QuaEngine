import type { EditorWritingDocument } from '@quajs/editor-core'
import type { QuaScriptDialogue, QuaScriptStep } from '@quajs/script-compiler'
import { parseQuaScriptDocument, QuaScriptParser } from '@quajs/script-compiler'

export function dialogues(source: string): QuaScriptDialogue[] {
  const document = parseQuaScriptDocument(source)
  const parsed = new QuaScriptParser().parse(document.dslBody)
  const error = [...document.diagnostics, ...parsed.diagnostics].find(item => item.severity === 'error')
  if (error)
    throw new Error(`QuaScript: ${error.message}`)
  return parsed.steps.filter((step: QuaScriptStep) => step.type === 'dialogue').map((step: QuaScriptStep) => step.content as QuaScriptDialogue)
}

export function literal(value: string): string {
  // Normal text stays readable. Structural tokens and interpolation are encoded as string literals.
  if (!/\$\{|[<>\r\n]|^\s*(?:@|#|-|\/\/)|[:：]/u.test(value))
    return value
  return `\${${JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')}}`
}

export function lines(prose: string, preserveSpeakers = false): { speaker: string, text: string }[] {
  if (typeof prose !== 'string' || prose.length > 200000)
    throw new Error('稿件超过 200000 字符上限。')
  const output: { speaker: string, text: string }[] = []
  for (const raw of prose.split(/\r?\n/u)) {
    const line = raw.trim()
    if (!line || /^#{1,6}\s/u.test(line))
      continue
    if (line.startsWith('```'))
      throw new Error('请移除代码围栏后再转换正文。')
    const match = /^([^:：]{1,80})[:：]\s*(.*)$/u.exec(line)
    const speaker = match?.[1].trim() ?? ''
    if (speaker && /[${}@<>\[\]\\]/u.test(speaker))
      throw new Error(`无法转换说话人：${speaker}`)
    output.push({ speaker: !preserveSpeakers && /^(?:旁白|narration|narrator)$/iu.test(speaker) ? '' : speaker, text: match?.[2] ?? line })
  }
  if (!output.length || output.some(line => !line.text))
    throw new Error('请提供非空的旁白或“人物：对白”正文。')
  return output
}

export function proseToQuaScript(prose: string): string {
  const input = lines(prose)
  const source = `${input.map(({ speaker, text }) => `${speaker ? `${speaker}: ` : ''}${literal(text)}`).join('\n\n')}\n`
  if (dialogues(source).length !== input.length)
    throw new Error('转换结果包含非对白结构，请检查说话人和正文。')
  return source
}

export function selected(document: EditorWritingDocument): QuaScriptDialogue[] {
  const all = dialogues(document.text)
  return all.filter(item => document.start === document.end
    || (item.textRange.start.offset >= document.start && item.textRange.end.offset <= document.end))
}

export function readable(item: QuaScriptDialogue): string {
  // Decode only JSON string literals, including static pieces alongside runtime
  // expressions. Otherwise a second revision would freeze encoded prose as code.
  let text = item.text
  for (let index = item.templateExpressions.length - 1; index >= 0; index--) {
    try {
      const value: unknown = JSON.parse(item.templateExpressions[index])
      if (typeof value === 'string') {
        const range = item.templateExpressionRanges[index]
        const start = range.start.offset - item.textRange.start.offset - 2
        const end = range.end.offset - item.textRange.start.offset + 1
        text = text.slice(0, start) + value + text.slice(end)
      }
    }
    catch { /* Keep dynamic interpolation visible. */ }
  }
  return text
}

export function dynamicExpressions(item: QuaScriptDialogue): string[] {
  return item.templateExpressions.filter(expression => {
    try { return typeof JSON.parse(expression) !== 'string' }
    catch { return true }
  })
}

export function sourceToProse(document: EditorWritingDocument): string {
  const items = selected(document)
  if (!items.length)
    throw new Error('当前文件或选区中没有完整对白。')
  return items.map(item => `${item.character ?? '旁白'}：${readable(item)}`).join('\n')
}

/** Replace text ranges only: host TypeScript, speakers, decorators, choices and comments survive. */
export function rewriteDialogue(document: EditorWritingDocument, prose: string): string {
  const items = selected(document)
  const replacements = lines(prose, true)
  if (items.length !== replacements.length)
    throw new Error('回写需保持对白数量；新增段落请使用追加或新建 QS。')
  let source = document.text
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    const replacement = replacements[index]
    const speaker = !item.character && /^(?:旁白|narration|narrator)$/iu.test(replacement.speaker) ? '' : replacement.speaker
    if ((item.character ?? '') !== speaker)
      throw new Error('回写需保持说话人顺序；请在 QS 中修改角色或使用新增模式。')
    if (readable(item) === replacement.text)
      continue
    if (dynamicExpressions(item).length)
      throw new Error('该对白包含动态表达式，请在 QS 中编辑，避免丢失变量或逻辑。')
    source = source.slice(0, item.textRange.start.offset) + literal(replacement.text) + source.slice(item.textRange.end.offset)
  }
  dialogues(source)
  return source
}
