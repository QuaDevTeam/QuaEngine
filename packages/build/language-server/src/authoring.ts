import type { DecoratorArgumentLanguageContribution } from '@quajs/plugin-discovery'
import type { ParsedQuaScript, QuaScriptDecorator, SourceRange } from '@quajs/script-compiler'
import type { QuaScriptLanguageOptions } from './index'
import { createLineStarts, rangeFromOffsets } from '@quajs/script-compiler'
import ts from 'typescript'
import { decoratorIndex } from './decorators'

/** UTF-16 offsets into the exact analyzed source; never regenerated source. */
export interface QuaScriptAuthoringField {
  label: string
  start: number
  end: number
  kind: 'string' | 'number' | 'boolean' | 'text' | 'expression'
  value: string
  choices?: string[]
  assetRoots?: string[]
  assetExtensions?: string[]
  characterNames?: boolean
}
export interface QuaScriptAuthoringDecorator {
  name: string
  start: number
  end: number
  fields: QuaScriptAuthoringField[]
}
export interface QuaScriptAuthoringStep {
  index: number
  start: number
  end: number
  line: number
  endLine: number
  kind: 'dialogue' | 'action' | 'choice'
  title: string
  fields: QuaScriptAuthoringField[]
  decorators: QuaScriptAuthoringDecorator[]
}
export interface QuaScriptAuthoring {
  steps: QuaScriptAuthoringStep[]
  decorators: { name: string, description?: string, args: string[], module: string, binding: string }[]
  characters: string[]
  error?: string
}

/** Uses the compiler's attachment rules, including blank-line action steps. No code runs. */
export async function collectQuaScriptAuthoring(source: string, parsed: ParsedQuaScript, options: QuaScriptLanguageOptions): Promise<QuaScriptAuthoring> {
  const lines = createLineStarts(source)
  const catalog = await decoratorIndex(source, options)
  const result: QuaScriptAuthoring = {
    steps: [],
    decorators: catalog.map(item => ({ name: item.name, description: item.language?.description, args: item.language?.args?.map(arg => arg.name || '') || [], module: item.mapping.module, binding: item.mapping.function })),
    characters: [...parsed.characters],
  }
  if (parsed.diagnostics.some(item => item.severity === 'error')) {
    result.error = '请先修复 QuaScript 语法错误，再编辑表单。'
    return result
  }
  result.steps = parsed.steps.slice(0, 5000).flatMap((step, index) => {
    if (!step.range)
      return []
    const content = step.content
    const decorators = content.type === 'choice'
      ? []
      : content.decorators.map((decorator) => {
          const metadata = catalog.find(item => item.name === decorator.name)?.language?.args
          return describeDecorator(source, decorator, metadata)
        }).filter((item): item is QuaScriptAuthoringDecorator => Boolean(item))
    const start = Math.min(step.range.start.offset, ...decorators.map(item => item.start))
    const end = Math.max(step.range.end.offset, ...decorators.map(item => item.end))
    const fields: QuaScriptAuthoringField[] = []
    if (content.type === 'dialogue') {
      fields.push(textField('文本', content.textRange, source))
      if (content.character && content.range) {
        const at = content.range.start.offset + source.slice(content.range.start.offset, content.textRange.start.offset).indexOf(content.character)
        fields.unshift({ label: '说话角色', start: at, end: at + content.character.length, kind: 'text', value: content.character, characterNames: true })
      }
    }
    return [{
      index,
      start,
      end,
      line: rangeFromOffsets(lines, start, end).start.line + 1,
      endLine: rangeFromOffsets(lines, start, end).end.line + 1,
      kind: step.type,
      title: content.type === 'dialogue' ? `${content.character ? `${content.character}: ` : ''}${content.text}`.slice(0, 100) : content.type === 'choice' ? '选择分支（在代码中编辑）' : decorators.map(item => `@${item.name}`).join(' · '),
      fields,
      decorators,
    }]
  })
  if (parsed.steps.length > 5000)
    result.error = '表单最多显示前 5000 个步骤，请拆分场景文件。'
  return result
}

function textField(label: string, range: SourceRange, source: string): QuaScriptAuthoringField {
  return { label, start: range.start.offset, end: range.end.offset, kind: 'text', value: source.slice(range.start.offset, range.end.offset) }
}

function describeDecorator(source: string, decorator: QuaScriptDecorator, metadata?: DecoratorArgumentLanguageContribution[]): QuaScriptAuthoringDecorator | undefined {
  if (!decorator.range)
    return undefined
  const { start, end } = decorator.range
  const result: QuaScriptAuthoringDecorator = { name: decorator.name, start: start.offset, end: end.offset, fields: [] }
  if (!decorator.argsRange)
    return result
  // Parse only the original argument bytes, preserving multiline indentation/comments.
  const prefix = 'f('
  const raw = source.slice(decorator.argsRange.start.offset, decorator.argsRange.end.offset)
  const file = ts.createSourceFile('arguments.ts', `${prefix}${raw})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = file.statements[0]
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
    return result
  const base = decorator.argsRange.start.offset - prefix.length
  let remaining = 160
  function visit(node: ts.Expression, label: string, depth: number, meta?: DecoratorArgumentLanguageContribution): void {
    if (--remaining < 0)
      return
    // Spreads, getters, computed keys and duplicate keys retain their source semantics.
    // They are exposed as one expression rather than an incomplete object form.
    const keys = ts.isObjectLiteralExpression(node) ? node.properties.map(property => ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name) ? property.name.getText(file).replace(/^['"]|['"]$/g, '') : undefined) : []
    if (ts.isObjectLiteralExpression(node) && node.properties.length && depth < 5 && keys.every(Boolean) && new Set(keys).size === keys.length) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property))
          visit(property.initializer, `${label}.${property.name.getText(file).replace(/^['"]|['"]$/g, '')}`, depth + 1)
      }
      return
    }
    const start = base + node.getStart(file)
    const end = base + node.end
    let kind: QuaScriptAuthoringField['kind'] = 'expression'
    let value = source.slice(start, end)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      kind = 'string'
      value = node.text
    }
    else if (ts.isNumericLiteral(node)) {
      kind = 'number'
      value = String(Number(node.text))
    }
    else if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator) && ts.isNumericLiteral(node.operand)) {
      kind = 'number'
      value = String(Number(node.operand.text) * (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1))
    }
    else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      kind = 'boolean'
    }
    result.fields.push({
      label,
      start,
      end,
      kind,
      value,
      choices: meta?.values?.map(value => typeof value === 'string' ? value : value.label),
      assetRoots: meta?.assetRoots,
      assetExtensions: meta?.assetExtensions,
      characterNames: meta?.characterNames,
    })
  }
  statement.expression.arguments.forEach((arg, index) => visit(arg, metadata?.[index]?.name || `参数 ${index + 1}`, 0, metadata?.[index]))
  return result
}
