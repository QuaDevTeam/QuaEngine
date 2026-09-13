import type { NativeUiTemplateScope } from './projection-template'

const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`
const EQUALITY_OPERATORS = ['===', '!==', '==', '!='] as const
const RELATIONAL_OPERATORS = ['<=', '>=', '<', '>'] as const

export function evaluateQuiExpression(expression: string, scope: NativeUiTemplateScope): unknown {
  const trimmed = stripOuterParens(expression.trim())
  if (!trimmed)
    return undefined

  const ternary = splitTopLevelTernary(trimmed)
  if (ternary) {
    const condition = evaluateQuiExpression(ternary.condition, scope)
    if (condition === undefined)
      return undefined
    return evaluateQuiExpression(Boolean(condition) ? ternary.whenTrue : ternary.whenFalse, scope)
  }

  const coalesce = splitTopLevelOperator(trimmed, '??')
  if (coalesce) {
    const left = evaluateQuiExpression(coalesce.left, scope)
    return left ?? evaluateQuiExpression(coalesce.right, scope)
  }

  const logicalOr = splitTopLevelOperator(trimmed, '||')
  if (logicalOr) {
    const left = evaluateQuiExpression(logicalOr.left, scope)
    return left ? left : evaluateQuiExpression(logicalOr.right, scope)
  }

  const logicalAnd = splitTopLevelOperator(trimmed, '&&')
  if (logicalAnd) {
    const left = evaluateQuiExpression(logicalAnd.left, scope)
    return left ? evaluateQuiExpression(logicalAnd.right, scope) : left
  }

  for (const operator of EQUALITY_OPERATORS) {
    const comparison = splitTopLevelOperator(trimmed, operator)
    if (!comparison)
      continue
    const left = evaluateQuiExpression(comparison.left, scope)
    const right = evaluateQuiExpression(comparison.right, scope)
    if (left === undefined || right === undefined)
      return undefined
    const equal = left === right
    return operator === '!=' || operator === '!==' ? !equal : equal
  }

  for (const operator of RELATIONAL_OPERATORS) {
    const comparison = splitTopLevelOperator(trimmed, operator)
    if (!comparison)
      continue
    const left = evaluateQuiExpression(comparison.left, scope)
    const right = evaluateQuiExpression(comparison.right, scope)
    if (!isComparableValue(left) || !isComparableValue(right))
      return undefined
    switch (operator) {
      case '<=':
        return left <= right
      case '>=':
        return left >= right
      case '<':
        return left < right
      case '>':
        return left > right
    }
  }

  if (trimmed.startsWith('!')) {
    const value = evaluateQuiExpression(trimmed.slice(1), scope)
    return value === undefined ? undefined : !value
  }

  const literal = literalValue(trimmed)
  if (literal.matched)
    return literal.value

  const structured = structuredLiteralValue(trimmed, scope)
  if (structured.matched)
    return structured.value

  return resolvePath(trimmed, scope)
}

function literalValue(expression: string): { matched: boolean, value?: unknown } {
  if (expression === 'true')
    return { matched: true, value: true }
  if (expression === 'false')
    return { matched: true, value: false }
  if (expression === 'null')
    return { matched: true, value: null }
  if (/^-?\d+(?:\.\d+)?$/.test(expression))
    return { matched: true, value: Number(expression) }

  const quote = expression[0]
  if ((quote === '"' || quote === '\'') && expression[expression.length - 1] === quote)
    return { matched: true, value: expression.slice(1, -1) }

  return { matched: false }
}

function structuredLiteralValue(
  expression: string,
  scope: NativeUiTemplateScope,
): { matched: boolean, value?: unknown } {
  if (expression.startsWith('[') && expression.endsWith(']')) {
    const inner = expression.slice(1, -1).trim()
    if (!inner)
      return { matched: true, value: [] }
    const values: unknown[] = []
    for (const part of splitTopLevelExpression(inner, ',')) {
      if (!part.trim())
        return { matched: true, value: undefined }
      const value = evaluateQuiExpression(part, scope)
      if (value === undefined)
        return { matched: true, value: undefined }
      values.push(value)
    }
    return { matched: true, value: values }
  }

  if (expression.startsWith('{') && expression.endsWith('}')) {
    const inner = expression.slice(1, -1).trim()
    if (!inner)
      return { matched: true, value: {} }
    const record: Record<string, unknown> = {}
    for (const entry of splitTopLevelExpression(inner, ',')) {
      if (!entry.trim())
        return { matched: true, value: undefined }
      const pair = splitFirstTopLevelDelimiter(entry, ':')
      if (!pair)
        return { matched: true, value: undefined }
      const key = objectLiteralKey(pair.left.trim())
      if (!key)
        return { matched: true, value: undefined }
      const value = evaluateQuiExpression(pair.right, scope)
      if (value === undefined)
        return { matched: true, value: undefined }
      record[key] = value
    }
    return { matched: true, value: record }
  }

  return { matched: false }
}

function objectLiteralKey(source: string): string | undefined {
  const literal = literalValue(source)
  if (literal.matched)
    return typeof literal.value === 'string' ? literal.value : undefined
  return /^[A-Za-z_$][\w$]*$/.test(source) ? source : undefined
}

function resolvePath(expression: string, scope: NativeUiTemplateScope): unknown {
  const parts = pathParts(expression)
  if (parts.length === 0)
    return undefined

  let current = scope.bindings && Object.prototype.hasOwnProperty.call(scope.bindings, parts[0])
    ? scope.bindings[parts[0]]
    : scope.context?.[parts[0]]

  for (const part of parts.slice(1)) {
    if (current === null || current === undefined)
      return undefined
    if (typeof part === 'number') {
      current = Array.isArray(current) ? current[part] : undefined
      continue
    }
    if (typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

function pathParts(expression: string): Array<number | string> {
  const normalized = expression.replace(/\?\./g, '.').trim()
  if (!new RegExp(String.raw`^${IDENTIFIER}(?:\.(?:${IDENTIFIER})|\[\d+\])*$`).test(normalized))
    return []

  const parts: Array<number | string> = []
  const matcher = new RegExp(String.raw`${IDENTIFIER}|\[(\d+)\]`, 'g')
  for (const match of normalized.matchAll(matcher))
    parts.push(match[1] !== undefined ? Number(match[1]) : match[0])
  return parts
}

function splitTopLevelOperator(expression: string, operator: string): { left: string, right: string } | undefined {
  let quote: string | undefined
  let depth = 0
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (quote) {
      if (char === quote && expression[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && expression.startsWith(operator, index)) {
      return {
        left: expression.slice(0, index),
        right: expression.slice(index + operator.length),
      }
    }
  }
  return undefined
}

function splitTopLevelTernary(expression: string): { condition: string, whenFalse: string, whenTrue: string } | undefined {
  let quote: string | undefined
  let depth = 0
  let questionIndex = -1
  let nestedTernary = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (quote) {
      if (char === quote && expression[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth !== 0)
      continue
    if (char === '?') {
      if (questionIndex === -1) {
        questionIndex = index
      }
      else {
        nestedTernary += 1
      }
      continue
    }
    if (char === ':' && questionIndex !== -1) {
      if (nestedTernary > 0) {
        nestedTernary -= 1
        continue
      }
      return {
        condition: expression.slice(0, questionIndex),
        whenTrue: expression.slice(questionIndex + 1, index),
        whenFalse: expression.slice(index + 1),
      }
    }
  }
  return undefined
}

function splitTopLevelExpression(expression: string, delimiter: string): string[] {
  const parts: string[] = []
  let quote: string | undefined
  let depth = 0
  let start = 0
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (quote) {
      if (char === quote && expression[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && char === delimiter) {
      parts.push(expression.slice(start, index))
      start = index + 1
    }
  }
  parts.push(expression.slice(start))
  return parts
}

function splitFirstTopLevelDelimiter(expression: string, delimiter: string): { left: string, right: string } | undefined {
  const parts = splitTopLevelExpression(expression, delimiter)
  if (parts.length < 2)
    return undefined
  return {
    left: parts[0],
    right: parts.slice(1).join(delimiter),
  }
}

function stripOuterParens(expression: string): string {
  let current = expression
  while (current.startsWith('(') && current.endsWith(')') && matchingCloseIndex(current, 0) === current.length - 1)
    current = current.slice(1, -1).trim()
  return current
}

function matchingCloseIndex(expression: string, openIndex: number): number {
  let quote: string | undefined
  let depth = 0
  for (let index = openIndex; index < expression.length; index += 1) {
    const char = expression[index]
    if (quote) {
      if (char === quote && expression[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0)
        return index
    }
  }
  return -1
}

function isComparableValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string'
}
