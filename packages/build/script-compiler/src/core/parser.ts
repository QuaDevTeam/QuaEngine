import type {
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDecoratorValue,
  QuaScriptDiagnostic,
  QuaScriptDialogue,
  QuaScriptStep,
  SourceRange,
} from './types'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { v4 as uuidv4 } from 'uuid'
import { createLineStarts, rangeFromOffsets } from './document'

interface ParsedLine {
  index: number
  offset: number
  raw: string
  range: SourceRange
  text: string
}

interface TemplateScanResult {
  diagnostics: Array<{
    end: number
    message: string
    start: number
  }>
  expressionRanges: Array<{
    end: number
    start: number
  }>
  expressions: string[]
  parts: string[]
}

/**
 * Parse QuaScript DSL string into structured AST.
 */
export class QuaScriptParser {
  private diagnostics: QuaScriptDiagnostic[] = []
  private lineStarts: number[] = []
  private lines: ParsedLine[] = []
  private originalLines: string[] = []
  private position = 0

  parse(quaScript: string): ParsedQuaScript {
    this.lineStarts = createLineStarts(quaScript)
    this.originalLines = quaScript.split('\n')
    this.lines = this.originalLines.map((raw, index) => {
      const withoutCarriage = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      const leading = withoutCarriage.length - withoutCarriage.trimStart().length
      const lineStart = this.lineStarts[index] ?? 0
      return {
        index,
        offset: lineStart + leading,
        raw: withoutCarriage,
        range: rangeFromOffsets(this.lineStarts, lineStart, lineStart + raw.length),
        text: withoutCarriage.trim(),
      }
    })
    this.position = 0
    this.diagnostics = []

    const steps: QuaScriptStep[] = []
    const characters = new Set<string>()
    const imports = new Set<string>()

    while (this.position < this.lines.length) {
      this.skipBlankLines()
      if (this.position >= this.lines.length) {
        break
      }

      const step = this.parseStep()
      if (step) {
        steps.push(step)

        if (step.type === 'dialogue') {
          const dialogue = step.content as QuaScriptDialogue
          characters.add(dialogue.character)
          dialogue.decorators.forEach((decorator) => {
            this.addRequiredImports(decorator, imports)
          })
        }
        else if (step.type === 'action') {
          const action = step.content as any
          action.decorators?.forEach((decorator: QuaScriptDecorator) => {
            this.addRequiredImports(decorator, imports)
          })
        }
      }
    }

    return {
      steps,
      imports,
      characters,
      diagnostics: this.diagnostics,
    }
  }

  static scanTemplateText(text: string): TemplateScanResult {
    return scanTemplateText(text)
  }

  private parseDecorators(): { decorators: QuaScriptDecorator[], shouldCreateSeparateAction: boolean } {
    const decorators: QuaScriptDecorator[] = []
    const decoratorStartPos = this.position

    while (this.position < this.lines.length) {
      const line = this.getCurrentLine()
      if (!line || line.text.length === 0) {
        break
      }
      if (!line.text.startsWith('@')) {
        break
      }

      const decorator = this.parseDecorator(line)
      if (decorator) {
        decorators.push(decorator)
      }

      this.advance()
    }

    let shouldCreateSeparateAction = false
    if (decorators.length > 0) {
      const nextLine = this.peekNextNonBlankLine()
      const hasDialogueNext = Boolean(nextLine && this.parseDialogueLine(nextLine))

      if (hasDialogueNext) {
        shouldCreateSeparateAction = this.hasGapBeforeLine(decoratorStartPos, nextLine!.index)
      }
      else {
        shouldCreateSeparateAction = true
      }
    }

    return { decorators, shouldCreateSeparateAction }
  }

  private hasGapBeforeLine(_decoratorStartPos: number, nextOriginalIndex: number): boolean {
    const lastDecorator = this.lines[this.position - 1]
    if (!lastDecorator) {
      return false
    }

    return this.originalLines
      .slice(lastDecorator.index + 1, nextOriginalIndex)
      .some(line => line.trim() === '')
  }

  private parseStep(): QuaScriptStep | null {
    const { decorators, shouldCreateSeparateAction } = this.parseDecorators()
    this.skipBlankLines()

    const choice = this.parseChoiceBlock()
    if (choice) {
      return {
        uuid: uuidv4(),
        type: 'choice',
        content: choice,
        range: choice.range,
      }
    }

    const line = this.getCurrentLine()
    const dialogue = line ? this.parseDialogueLine(line) : null
    if (dialogue) {
      this.advance()

      if (decorators.length > 0 && shouldCreateSeparateAction) {
        this.position--
        return {
          uuid: uuidv4(),
          type: 'action',
          content: {
            type: 'action',
            decorators,
            range: decorators[0]?.range,
          },
          range: decorators[0]?.range,
        }
      }

      const dialogueLine = line!
      const templateScan = scanTemplateText(dialogue.text)
      templateScan.diagnostics.forEach((diagnostic) => {
        this.diagnostics.push({
          message: diagnostic.message,
          range: rangeFromOffsets(
            this.lineStarts,
            dialogue.textOffset + diagnostic.start,
            dialogue.textOffset + diagnostic.end,
          ),
          severity: 'error',
        })
      })

      return {
        uuid: uuidv4(),
        type: 'dialogue',
        content: {
          type: 'dialogue',
          character: dialogue.character,
          text: dialogue.text,
          decorators,
          templateExpressions: templateScan.expressions,
          templateExpressionRanges: templateScan.expressionRanges.map(expressionRange =>
            rangeFromOffsets(
              this.lineStarts,
              dialogue.textOffset + expressionRange.start,
              dialogue.textOffset + expressionRange.end,
            ),
          ),
          range: dialogueLine.range,
        } as QuaScriptDialogue,
        range: dialogueLine.range,
      }
    }

    if (decorators.length > 0) {
      return {
        uuid: uuidv4(),
        type: 'action',
        content: {
          type: 'action',
          decorators,
          range: decorators[0]?.range,
        },
        range: decorators[0]?.range,
      }
    }

    if (line?.text) {
      this.diagnostics.push({
        message: `Unrecognized QuaScript line: ${line.text}`,
        range: line.range,
        severity: 'warning',
      })
      this.advance()
    }
    return null
  }

  private parseChoiceBlock(): QuaScriptChoice | null {
    const options: QuaScriptChoice['options'] = []
    const start = this.getCurrentLine()?.range.start
    let end = this.getCurrentLine()?.range.end

    while (this.position < this.lines.length) {
      const line = this.getCurrentLine()
      if (!line || line.text.length === 0) {
        this.advance()
        continue
      }
      const option = this.parseChoiceOption(line)
      if (!option) {
        break
      }

      options.push(option)
      end = line.range.end
      this.advance()
    }

    return options.length
      ? {
          type: 'choice',
          options,
          range: start && end ? { start, end } : undefined,
        }
      : null
  }

  private parseChoiceOption(line: ParsedLine): QuaScriptChoice['options'][number] | null {
    if (!line.text.startsWith('- ')) {
      return null
    }

    const rawBody = line.text.slice(2)
    const bodyLeading = rawBody.length - rawBody.trimStart().length
    const body = rawBody.trim()
    const bodyOffset = line.offset + 2 + bodyLeading
    const arrow = splitTopLevelArrow(body)
    const conditionSplit = arrow.after
      ? splitTopLevelKeyword(arrow.after.trim(), 'if')
      : splitTopLevelKeyword(arrow.before.trim(), 'if')
    const textSource = arrow.after ? arrow.before : conditionSplit.before
    const targetSource = arrow.after ? conditionSplit.before : undefined
    const condition = conditionSplit.after
    const text = textSource.trim()
    if (!text) {
      this.diagnostics.push({
        message: 'Choice text cannot be empty.',
        range: line.range,
        severity: 'error',
      })
      return null
    }

    const target = targetSource?.trim()
    const id = target || this.slugChoiceId(text)
    const conditionRange = condition
      ? this.createChoiceConditionRange(body, bodyOffset, arrow, conditionSplit)
      : undefined
    return {
      id,
      text,
      target: target || id,
      condition: condition?.trim(),
      conditionRange,
      range: line.range,
    }
  }

  private slugChoiceId(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'choice'
  }

  private parseDecorator(line: ParsedLine): QuaScriptDecorator | null {
    const decoratorSource = line.text.slice(1)
    const name = readIdentifierName(decoratorSource)
    if (!name) {
      this.diagnostics.push({
        message: `Invalid decorator syntax: ${line.text}`,
        range: line.range,
        severity: 'error',
      })
      return null
    }

    const restSource = decoratorSource.slice(name.length)
    const restLeading = restSource.length - restSource.trimStart().length
    const rest = restSource.trim()
    if (!rest) {
      return { name, args: [], range: line.range }
    }

    if (!rest.startsWith('(') || !rest.endsWith(')') || !isBalancedWrapper(rest, '(', ')')) {
      this.diagnostics.push({
        message: `Invalid decorator arguments for @${name}.`,
        range: line.range,
        severity: 'error',
      })
      return { name, args: [], range: line.range }
    }

    const argsString = rest.slice(1, -1)
    const argsStart = line.offset + 1 + name.length + restLeading + 1
    return {
      name,
      args: this.parseDecoratorArgs(argsString, line),
      argsRange: rangeFromOffsets(this.lineStarts, argsStart, argsStart + argsString.length),
      range: line.range,
    }
  }

  private createChoiceConditionRange(
    body: string,
    bodyOffset: number,
    arrow: { after?: string, before: string, index?: number },
    conditionSplit: { after?: string, before: string, index?: number },
  ): SourceRange | undefined {
    if (conditionSplit.after === undefined || conditionSplit.index === undefined) {
      return undefined
    }

    const source = arrow.after === undefined
      ? body
      : arrow.after
    const sourceOffset = arrow.after === undefined
      ? bodyOffset
      : bodyOffset + (arrow.index ?? 0) + 2
    const leading = source.length - source.trimStart().length
    const conditionLeading = conditionSplit.after.length - conditionSplit.after.trimStart().length
    const start = sourceOffset + leading + conditionSplit.index + 'if'.length + conditionLeading
    const end = start + conditionSplit.after.trim().length
    return rangeFromOffsets(this.lineStarts, start, end)
  }

  private parseDecoratorArgs(argsString: string, line: ParsedLine): QuaScriptDecoratorValue[] {
    if (!argsString.trim()) {
      return []
    }

    try {
      const parsed = parse(`__quaDecorator__(${argsString})`, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      })
      const statement = parsed.program.body[0]
      if (statement?.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
        const values: QuaScriptDecoratorValue[] = []
        statement.expression.arguments.forEach((argument) => {
          if (t.isExpression(argument)) {
            values.push(this.convertExpressionValue(argument))
            return
          }

          this.diagnostics.push({
            message: 'Unsupported TypeScript decorator argument syntax.',
            range: line.range,
            severity: 'error',
          })
        })
        return values
      }
    }
    catch (error) {
      this.diagnostics.push({
        message: `Invalid TypeScript decorator arguments: ${error instanceof Error ? error.message : String(error)}`,
        range: line.range,
        severity: 'error',
      })
      return []
    }

    this.diagnostics.push({
      message: 'Invalid TypeScript decorator arguments.',
      range: line.range,
      severity: 'error',
    })
    return []
  }

  private convertExpressionValue(node: t.Expression): QuaScriptDecoratorValue {
    switch (node.type) {
      case 'StringLiteral':
        return node.value
      case 'NumericLiteral':
        return node.value
      case 'BooleanLiteral':
        return node.value
      case 'NullLiteral':
        return null
      case 'ArrayExpression':
        return node.elements
          .filter((element): element is t.Expression => Boolean(element) && t.isExpression(element))
          .map(element => this.convertExpressionValue(element))
      case 'ObjectExpression':
        return Object.fromEntries(node.properties
          .filter((property): property is t.ObjectProperty => t.isObjectProperty(property) && t.isExpression(property.value))
          .map((property) => {
            const key = t.isIdentifier(property.key)
              ? property.key.name
              : String((property.key as t.StringLiteral | t.NumericLiteral).value)
            const value = property.value
            return [key, t.isExpression(value) ? this.convertExpressionValue(value) : null]
          }))
      case 'UnaryExpression':
        if (node.operator === '-' && t.isNumericLiteral(node.argument)) {
          return -node.argument.value
        }
        return node
      default:
        return node
    }
  }

  private parseDialogueLine(line: ParsedLine): { character: string, text: string, textOffset: number } | null {
    const colon = findTopLevelColon(line.text)
    if (colon <= 0) {
      return null
    }

    const character = line.text.slice(0, colon).trim()
    const rawText = line.text.slice(colon + 1)
    const textLeading = rawText.length - rawText.trimStart().length
    const text = rawText.trimStart()
    if (!character || character.startsWith('-') || character.startsWith('@')) {
      return null
    }

    return {
      character,
      text,
      textOffset: line.offset + colon + 1 + textLeading,
    }
  }

  private addRequiredImports(decorator: QuaScriptDecorator, imports: Set<string>) {
    switch (decorator.name) {
      case 'SetSprite':
      case 'ShowCharacter':
      case 'HideCharacter':
      case 'MoveCharacter':
      case 'SetExpression':
        imports.add('@quajs/character')
        break
    }
  }

  private getCurrentLine(): ParsedLine | null {
    return this.position < this.lines.length ? this.lines[this.position] : null
  }

  private peekNextNonBlankLine(): ParsedLine | null {
    for (let index = this.position; index < this.lines.length; index++) {
      const line = this.lines[index]
      if (line.text.length > 0) {
        return line
      }
    }
    return null
  }

  private skipBlankLines(): void {
    while (this.position < this.lines.length && this.lines[this.position].text.length === 0) {
      this.position++
    }
  }

  private advance(): void {
    this.position++
  }
}

export function scanTemplateText(text: string): TemplateScanResult {
  const diagnostics: TemplateScanResult['diagnostics'] = []
  const expressionRanges: TemplateScanResult['expressionRanges'] = []
  const parts: string[] = []
  const expressions: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf('${', cursor)
    if (start === -1) {
      break
    }

    const end = findBalancedExpressionEnd(text, start + 2)
    if (end === -1) {
      diagnostics.push({
        message: 'Unterminated QuaScript interpolation. Expected a closing }.',
        start,
        end: text.length,
      })
      break
    }

    const expression = text.slice(start + 2, end).trim()
    if (!expression) {
      diagnostics.push({
        message: 'QuaScript interpolation cannot be empty.',
        start,
        end: end + 1,
      })
    }

    parts.push(text.slice(cursor, start))
    expressions.push(expression)
    expressionRanges.push({
      end,
      start: start + 2,
    })
    cursor = end + 1
  }

  parts.push(text.slice(cursor))
  return { diagnostics, expressionRanges, expressions, parts }
}

function findBalancedExpressionEnd(source: string, start: number): number {
  let depth = 0
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = start; index < source.length; index++) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }

    if (char === '{' || char === '(' || char === '[') {
      depth++
      continue
    }
    if (char === '}' || char === ')' || char === ']') {
      if (char === '}' && depth === 0) {
        return index
      }
      depth = Math.max(0, depth - 1)
    }
  }

  return -1
}

function splitTopLevelKeyword(source: string, keyword: string): { before: string, after?: string, index?: number } {
  const index = findTopLevelKeyword(source, keyword)
  if (index === -1) {
    return { before: source }
  }
  return {
    before: source.slice(0, index),
    after: source.slice(index + keyword.length),
    index,
  }
}

function findTopLevelKeyword(source: string, keyword: string): number {
  for (const item of scanTopLevel(source)) {
    if (
      item.char === keyword[0]
      && source.slice(item.index, item.index + keyword.length) === keyword
      && isKeywordBoundary(source[item.index - 1])
      && isKeywordBoundary(source[item.index + keyword.length])
    ) {
      return item.index
    }
  }
  return -1
}

function splitTopLevelArrow(source: string): { before: string, after?: string, index?: number } {
  for (const item of scanTopLevel(source)) {
    if (item.char === '-' && source[item.index + 1] === '>') {
      return {
        before: source.slice(0, item.index),
        after: source.slice(item.index + 2),
        index: item.index,
      }
    }
  }
  return { before: source }
}

function findTopLevelColon(source: string): number {
  for (const item of scanTopLevel(source)) {
    if (item.char === ':') {
      return item.index
    }
  }
  return -1
}

function isBalancedWrapper(source: string, open: string, close: string): boolean {
  if (source[0] !== open || source[source.length - 1] !== close) {
    return false
  }
  return findWrapperClose(source, 0, open, close) === source.length - 1
}

function findWrapperClose(source: string, start: number, open: string, close: string): number {
  let depth = 0
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === open) {
      depth++
    }
    else if (char === close) {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return -1
}

function scanTopLevel(source: string): Array<{ char: string, index: number }> {
  const result: Array<{ char: string, index: number }> = []
  const stack: string[] = []
  let quote: '"' | '\'' | '`' | null = null
  let escaped = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      stack.pop()
      continue
    }

    if (stack.length === 0) {
      result.push({ char, index })
    }
  }

  return result
}

function isKeywordBoundary(char: string | undefined): boolean {
  return !char || /\s/.test(char)
}

function readIdentifierName(source: string): string | null {
  const first = source[0]
  if (!first || !isIdentifierStart(first)) {
    return null
  }

  let end = 1
  while (end < source.length && isIdentifierPart(source[end])) {
    end++
  }
  return source.slice(0, end)
}

function isIdentifierStart(char: string): boolean {
  return char === '_' || char === '$' || /[a-z]/i.test(char)
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || /\d/.test(char)
}
