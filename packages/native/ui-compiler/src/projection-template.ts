import type {
  NativeQuiActionArgument,
  NativeQuiActionArgumentValue,
  NativeQuiProp,
} from './types'
import { propString, stripQuotes } from './projection-props'

export interface NativeUiTemplateScope {
  bindings?: Record<string, unknown>
  context?: Record<string, unknown>
  currentLoopKey?: string
  hasContext: boolean
  idSuffix?: string
}

const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`
const EQUALITY_OPERATORS = ['===', '!==', '==', '!='] as const

export function templateBooleanProp(
  props: readonly NativeQuiProp[],
  name: string,
  scope: NativeUiTemplateScope,
): boolean | undefined {
  const value = propByName(props, name)?.value
  if (!value)
    return undefined
  const evaluated = evaluateQuiExpression(value, scope)
  if (evaluated === undefined)
    return propString(props, name) === 'true' ? true : propString(props, name) === 'false' ? false : undefined
  return typeof evaluated === 'boolean' ? evaluated : Boolean(evaluated)
}

export function templateStringProp(
  props: readonly NativeQuiProp[],
  name: string,
  scope: NativeUiTemplateScope,
): string | undefined {
  return templateStringValue(propByName(props, name)?.value, scope)
}

export function templateStringValue(
  expression: string | undefined,
  scope: NativeUiTemplateScope,
): string | undefined {
  if (!expression)
    return undefined
  const evaluated = evaluateQuiExpression(expression, scope)
  if (evaluated === undefined)
    return stripQuotes(expression.trim())
  if (evaluated === null)
    return undefined
  if (typeof evaluated === 'string')
    return evaluated
  if (typeof evaluated === 'number' || typeof evaluated === 'boolean')
    return String(evaluated)
  return undefined
}

export function scopedNodeId(id: string, scope: NativeUiTemplateScope): string {
  return scope.idSuffix ? `${id}:${scope.idSuffix}` : id
}

export function currentLoopScopedKey(scope: NativeUiTemplateScope, key: string): string {
  const parentSuffix = parentLoopSuffix(scope)
  return parentSuffix ? `${parentSuffix}.${key}` : key
}

export function resolvedActionArgument(
  argument: NativeQuiActionArgument,
  scope: NativeUiTemplateScope,
): NativeQuiActionArgumentValue | undefined {
  if (argument.kind === 'literal')
    return argument.value
  if (argument.kind !== 'reference')
    return undefined
  const value = evaluateQuiExpression(argument.source, scope)
  return isActionArgumentValue(value) ? value : undefined
}

export function evaluateQuiExpression(expression: string, scope: NativeUiTemplateScope): unknown {
  const trimmed = expression.trim()
  if (!trimmed)
    return undefined

  if (trimmed.startsWith('!')) {
    const value = evaluateQuiExpression(trimmed.slice(1), scope)
    return value === undefined ? undefined : !value
  }

  const coalesce = splitTopLevelOperator(trimmed, '??')
  if (coalesce) {
    const left = evaluateQuiExpression(coalesce.left, scope)
    return left ?? evaluateQuiExpression(coalesce.right, scope)
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

  const literal = literalValue(trimmed)
  if (literal.matched)
    return literal.value

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
    if (char === '(' || char === '[') {
      depth += 1
      continue
    }
    if (char === ')' || char === ']') {
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

function propByName(props: readonly NativeQuiProp[], name: string): NativeQuiProp | undefined {
  return props.find(prop => prop.name === name)
}

function parentLoopSuffix(scope: NativeUiTemplateScope): string | undefined {
  if (!scope.idSuffix || !scope.currentLoopKey)
    return scope.idSuffix
  if (scope.idSuffix === scope.currentLoopKey)
    return undefined
  const ownSuffix = `.${scope.currentLoopKey}`
  return scope.idSuffix.endsWith(ownSuffix)
    ? scope.idSuffix.slice(0, -ownSuffix.length)
    : scope.idSuffix
}

function isActionArgumentValue(value: unknown): value is NativeQuiActionArgumentValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
}
