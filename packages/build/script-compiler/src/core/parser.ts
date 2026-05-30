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

interface DecoratorSource {
  lines: ParsedLine[]
  offset: number
  range: SourceRange
  text: string
}

interface TemplateScanResult {
  diagnostics: Array<{
    code: string
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

      const { consumedLines, decorator } = this.parseDecoratorAtCurrentPosition()
      if (decorator) {
        decorators.push(decorator)
      }

      this.position += consumedLines
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

    const decoratorChoice = this.createChoiceBlockFromDecorators(decorators)
    if (decoratorChoice) {
      return {
        uuid: uuidv4(),
        type: 'choice',
        content: decoratorChoice,
        range: decoratorChoice.range,
      }
    }

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
          code: diagnostic.code,
          message: diagnostic.message,
          range: rangeFromOffsets(
            this.lineStarts,
            dialogue.textOffset + diagnostic.start,
            dialogue.textOffset + diagnostic.end,
          ),
          severity: 'error',
          source: 'quascript/parser',
        })
      })

      return {
        uuid: uuidv4(),
        type: 'dialogue',
        content: {
          type: 'dialogue',
          character: dialogue.character,
          text: dialogue.text,
          textRange: rangeFromOffsets(
            this.lineStarts,
            dialogue.textOffset,
            dialogue.textOffset + dialogue.text.length,
          ),
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
        code: 'QS_PARSE_UNRECOGNIZED_LINE',
        message: `Unrecognized QuaScript line: ${line.text}`,
        range: line.range,
        severity: 'warning',
        source: 'quascript/parser',
      })
      this.advance()
    }
    return null
  }

  private createChoiceBlockFromDecorators(decorators: QuaScriptDecorator[]): QuaScriptChoice | null {
    const choiceDecorators = decorators.filter(decorator => decorator.name === 'Choice')
    if (choiceDecorators.length === 0) {
      return null
    }
    if (choiceDecorators.length !== decorators.length) {
      this.diagnostics.push({
        code: 'QS_PARSE_MIXED_CHOICE_DECORATORS',
        message: '@Choice decorators cannot be mixed with non-choice decorators in the same action block.',
        range: choiceDecorators[0].range,
        severity: 'error',
        source: 'quascript/parser',
      })
    }

    const options = choiceDecorators.map((decorator, index): QuaScriptChoice['options'][number] => {
      const rawText = decorator.args[0]
      if (typeof rawText !== 'string') {
        this.diagnostics.push({
          code: 'QS_PARSE_CHOICE_LABEL_REQUIRED',
          message: '@Choice requires a string label as its first argument.',
          range: decorator.range,
          severity: 'error',
          source: 'quascript/parser',
        })
      }
      const text = typeof rawText === 'string' ? rawText : `Choice ${index + 1}`
      const templateScan = scanTemplateText(text)
      templateScan.diagnostics.forEach((diagnostic) => {
        this.diagnostics.push({
          code: diagnostic.code,
          message: diagnostic.message,
          range: decorator.range,
          severity: 'error',
          source: 'quascript/parser',
        })
      })
      return {
        id: getDecoratorChoiceId(decorator.args[2]) || getChoiceTargetId(decorator.args[1]) || this.slugChoiceId(text),
        text,
        textRange: decorator.argsRange || decorator.range!,
        target: decorator.args[1],
        options: decorator.args[2],
        templateExpressions: templateScan.expressions,
        templateExpressionRanges: [],
        range: decorator.range,
        source: 'decorator',
      }
    })
    const start = choiceDecorators[0].range?.start
    const end = choiceDecorators[choiceDecorators.length - 1].range?.end
    return {
      type: 'choice',
      options,
      range: start && end ? { start, end } : undefined,
    }
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
        code: 'QS_PARSE_EMPTY_CHOICE_TEXT',
        message: 'Choice text cannot be empty.',
        range: line.range,
        severity: 'error',
        source: 'quascript/parser',
      })
      return null
    }

    const target = targetSource?.trim()
    const id = target || this.slugChoiceId(text)
    const textRange = createTrimmedRange(this.lineStarts, textSource, bodyOffset)
    const templateScan = scanTemplateText(text)
    templateScan.diagnostics.forEach((diagnostic) => {
      this.diagnostics.push({
        code: diagnostic.code,
        message: diagnostic.message,
        range: rangeFromOffsets(
          this.lineStarts,
          textRange.start.offset + diagnostic.start,
          textRange.start.offset + diagnostic.end,
        ),
        severity: 'error',
        source: 'quascript/parser',
      })
    })
    const conditionRange = condition
      ? this.createChoiceConditionRange(body, bodyOffset, arrow, conditionSplit)
      : undefined
    return {
      id,
      text,
      textRange,
      target: target || id,
      condition: condition?.trim(),
      conditionRange,
      templateExpressions: templateScan.expressions,
      templateExpressionRanges: templateScan.expressionRanges.map(expressionRange =>
        rangeFromOffsets(
          this.lineStarts,
          textRange.start.offset + expressionRange.start,
          textRange.start.offset + expressionRange.end,
        ),
      ),
      range: line.range,
      source: 'sugar',
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

  private parseDecoratorAtCurrentPosition(): { consumedLines: number, decorator: QuaScriptDecorator | null } {
    const line = this.getCurrentLine()
    if (!line) {
      return { consumedLines: 1, decorator: null }
    }
    const source = this.collectDecoratorSource(line)
    return {
      consumedLines: source.lines.length,
      decorator: this.parseDecorator(source),
    }
  }

  private collectDecoratorSource(firstLine: ParsedLine): DecoratorSource {
    const lines = [firstLine]
    let text = firstLine.text
    while (needsMoreDecoratorSource(text) && this.position + lines.length < this.lines.length) {
      const next = this.lines[this.position + lines.length]
      text += `\n${next.text}`
      lines.push(next)
    }
    const lastLine = lines[lines.length - 1]
    return {
      lines,
      offset: firstLine.offset,
      range: {
        start: firstLine.range.start,
        end: lastLine.range.end,
      },
      text,
    }
  }

  private parseDecorator(source: DecoratorSource): QuaScriptDecorator | null {
    const decoratorSource = source.text.slice(1)
    const name = readIdentifierName(decoratorSource)
    if (!name) {
      this.diagnostics.push({
        code: 'QS_PARSE_INVALID_DECORATOR_SYNTAX',
        message: `Invalid decorator syntax: ${source.text}`,
        range: source.range,
        severity: 'error',
        source: 'quascript/parser',
      })
      return null
    }

    const restSource = decoratorSource.slice(name.length)
    const restLeading = restSource.length - restSource.trimStart().length
    const rest = restSource.trim()
    if (!rest) {
      return { name, args: [], range: source.range }
    }

    if (!rest.startsWith('(') || !rest.endsWith(')') || !isBalancedWrapper(rest, '(', ')')) {
      this.diagnostics.push({
        code: 'QS_PARSE_INVALID_DECORATOR_ARGUMENTS',
        message: `Invalid decorator arguments for @${name}.`,
        range: source.range,
        severity: 'error',
        source: 'quascript/parser',
      })
      return { name, args: [], range: source.range }
    }

    const openLocal = 1 + name.length + restLeading
    const closeLocal = findWrapperClose(source.text, openLocal, '(', ')')
    const argsString = source.text.slice(openLocal + 1, closeLocal)
    const argsStart = this.decoratorLocalOffsetToSourceOffset(source, openLocal + 1)
    const argsEnd = this.decoratorLocalOffsetToSourceOffset(source, closeLocal)
    return {
      name,
      args: this.parseDecoratorArgs(argsString, source),
      argsRange: rangeFromOffsets(this.lineStarts, argsStart, argsEnd),
      range: source.range,
    }
  }

  private decoratorLocalOffsetToSourceOffset(source: DecoratorSource, localOffset: number): number {
    let cursor = 0
    for (let index = 0; index < source.lines.length; index++) {
      const line = source.lines[index]
      const lineTextLength = line.text.length
      if (localOffset <= cursor + lineTextLength) {
        return line.offset + (localOffset - cursor)
      }
      cursor += lineTextLength
      if (index < source.lines.length - 1) {
        if (localOffset === cursor) {
          return line.range.end.offset
        }
        cursor += 1
      }
    }
    return source.lines[source.lines.length - 1].range.end.offset
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

  private parseDecoratorArgs(argsString: string, line: Pick<ParsedLine, 'range'>): QuaScriptDecoratorValue[] {
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
            code: 'QS_PARSE_UNSUPPORTED_DECORATOR_ARGUMENT',
            message: 'Unsupported TypeScript decorator argument syntax.',
            range: line.range,
            severity: 'error',
            source: 'quascript/parser',
          })
        })
        return values
      }
    }
    catch (error) {
      this.diagnostics.push({
        code: 'QS_PARSE_INVALID_TYPESCRIPT_DECORATOR_ARGUMENTS',
        message: `Invalid TypeScript decorator arguments: ${error instanceof Error ? error.message : String(error)}`,
        range: line.range,
        severity: 'error',
        source: 'quascript/parser',
      })
      return []
    }

    this.diagnostics.push({
      code: 'QS_PARSE_INVALID_TYPESCRIPT_DECORATOR_ARGUMENTS',
      message: 'Invalid TypeScript decorator arguments.',
      range: line.range,
      severity: 'error',
      source: 'quascript/parser',
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
        code: 'QS_PARSE_UNTERMINATED_INTERPOLATION',
        message: 'Unterminated QuaScript interpolation. Expected a closing }.',
        start,
        end: text.length,
      })
      break
    }

    const expression = text.slice(start + 2, end).trim()
    if (!expression) {
      diagnostics.push({
        code: 'QS_PARSE_EMPTY_INTERPOLATION',
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

function createTrimmedRange(lineStarts: readonly number[], source: string, sourceOffset: number): SourceRange {
  const leading = source.length - source.trimStart().length
  const trailing = source.trimEnd().length
  const start = sourceOffset + leading
  const end = sourceOffset + trailing
  return rangeFromOffsets(lineStarts, start, end)
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

function needsMoreDecoratorSource(source: string): boolean {
  const open = source.indexOf('(')
  if (open === -1) {
    return false
  }
  return findWrapperClose(source, open, '(', ')') === -1
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

function getDecoratorChoiceId(value: QuaScriptDecoratorValue | undefined): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isBabelExpressionValue(value)) {
    return undefined
  }
  const id = (value as Record<string, QuaScriptDecoratorValue>).id
  return typeof id === 'string' ? id : undefined
}

function getChoiceTargetId(value: QuaScriptDecoratorValue | undefined): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (isBabelExpressionValue(value)) {
    return getChoiceTargetIdFromExpression(value)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || isBabelExpressionValue(value)) {
    return undefined
  }
  const record = value as Record<string, QuaScriptDecoratorValue>
  const kind = record.kind
  if (kind === 'node' || kind === 'label' || kind === 'checkpoint') {
    return typeof record.id === 'string' ? record.id : undefined
  }
  if (kind === 'scene') {
    return typeof record.sceneId === 'string' ? record.sceneId : undefined
  }
  if (kind === 'script') {
    return typeof record.stepId === 'string'
      ? record.stepId
      : typeof record.nodeId === 'string'
        ? record.nodeId
        : typeof record.labelId === 'string'
          ? record.labelId
          : typeof record.moduleId === 'string'
            ? record.moduleId
            : undefined
  }
  if (kind === 'package-node') {
    return typeof record.nodeId === 'string' ? record.nodeId : undefined
  }
  return undefined
}

function getChoiceTargetIdFromExpression(value: t.Expression): string | undefined {
  if (!t.isCallExpression(value) || !t.isIdentifier(value.callee)) {
    return undefined
  }
  const first = value.arguments[0]
  const second = value.arguments[1]
  if (value.callee.name === 'packageNode' && t.isStringLiteral(second)) {
    return second.value
  }
  return t.isStringLiteral(first) ? first.value : undefined
}

function isBabelExpressionValue(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}

function isIdentifierStart(char: string): boolean {
  return char === '_' || char === '$' || /[a-z]/i.test(char)
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || /\d/.test(char)
}
