import type {
  NativeQuiActionArgument,
  NativeQuiActionArgumentValue,
  NativeQuiProp,
} from './types'
import { evaluateQuiExpression } from './projection-expression'
import { propString, stripQuotes } from './projection-props'

export interface NativeUiTemplateScope {
  bindings?: Record<string, unknown>
  context?: Record<string, unknown>
  currentLoopKey?: string
  hasContext: boolean
  idSuffix?: string
}

export { evaluateQuiExpression } from './projection-expression'

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
  const value = evaluateQuiExpression(argument.source, scope)
  return isActionArgumentValue(value) ? value : undefined
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
