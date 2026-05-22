import type { QuaAssetLineageRef } from './types'
import {
  asRecord,
  STORY_ASSET_TYPES,
  stringValue,
} from './utils'

export function collectAssetRefs(values: unknown[], meta: {
  sourceId?: string
  sourceKind: string
  sourceLocation?: QuaAssetLineageRef['sourceLocation']
}): QuaAssetLineageRef[] {
  const refs: QuaAssetLineageRef[] = []
  for (const value of values) {
    collectAssetRefsFromUnknown(value, refs, meta)
  }
  return refs
}

function collectAssetRefsFromUnknown(
  value: unknown,
  refs: QuaAssetLineageRef[],
  meta: {
    field?: string
    sourceId?: string
    sourceKind: string
    sourceLocation?: QuaAssetLineageRef['sourceLocation']
  },
): void {
  if (isImageHelperCall(value)) {
    const name = stringArgument(value.arguments[0])
    const options = objectArgument(value.arguments[1]) || {}
    if (name) {
      refs.push({
        field: meta.field,
        name,
        packageId: stringValue(options.runtimePackageId),
        sourceId: meta.sourceId,
        sourceKind: meta.sourceKind,
        sourceLocation: meta.sourceLocation,
        status: 'unknown',
        type: 'images',
      })
    }
    return
  }

  const record = asRecord(value)
  if (record && typeof record.type === 'string' && STORY_ASSET_TYPES.has(record.type) && typeof record.name === 'string') {
    refs.push({
      field: meta.field,
      name: record.name,
      packageId: stringValue(record.runtimePackageId),
      sourceId: meta.sourceId,
      sourceKind: meta.sourceKind,
      sourceLocation: meta.sourceLocation,
      status: 'unknown',
      type: record.type,
    })
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectAssetRefsFromUnknown(item, refs, meta))
    return
  }
  if (record) {
    Object.entries(record).forEach(([field, item]) => collectAssetRefsFromUnknown(item, refs, { ...meta, field }))
  }
}

function objectArgument(value: unknown): Record<string, unknown> | undefined {
  if (!isObjectExpressionNode(value)) {
    return undefined
  }
  return Object.fromEntries((value.properties as unknown[])
    .filter(isObjectPropertyNode)
    .map((property) => {
      const key = isIdentifierNode(property.key)
        ? property.key.name
        : String((property.key as StringLiteralLike | NumericLiteralLike).value)
      return [key, normalizeAssetValue(property.value)]
    }))
}

function normalizeAssetValue(value: unknown): unknown {
  if (isStringLiteralNode(value)) {
    return value.value
  }
  if (isNumericLiteralNode(value)) {
    return value.value
  }
  if (isBooleanLiteralNode(value)) {
    return value.value
  }
  if (isNullLiteralNode(value)) {
    return null
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAssetValue)
  }
  if (isObjectExpressionNode(value)) {
    return objectArgument(value)
  }
  return value
}

function getCallCalleeName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const call = value as { callee?: unknown, type?: unknown }
  if (call.type !== 'CallExpression' || !isIdentifierNode(call.callee)) {
    return undefined
  }
  return call.callee.name
}

function isImageHelperCall(value: unknown): value is CallExpressionLike {
  return getCallCalleeName(value) === 'image'
}

function stringArgument(value: unknown): string | undefined {
  return isStringLiteralNode(value) ? value.value : undefined
}

type CallExpressionLike = { arguments: unknown[], callee?: unknown, type: 'CallExpression' }
type IdentifierLike = { name: string, type: 'Identifier' }
type StringLiteralLike = { type: 'StringLiteral', value: string }
type NumericLiteralLike = { type: 'NumericLiteral', value: number }
type ObjectPropertyLike = { computed?: boolean, key: IdentifierLike | StringLiteralLike | NumericLiteralLike, type: 'ObjectProperty', value: unknown }
type ObjectExpressionLike = { properties: unknown[], type: 'ObjectExpression' }
type BooleanLiteralLike = { type: 'BooleanLiteral', value: boolean }
type NullLiteralLike = { type: 'NullLiteral' }

function isIdentifierNode(value: unknown): value is IdentifierLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'Identifier'
    && typeof (value as { name?: unknown }).name === 'string'
}

function isStringLiteralNode(value: unknown): value is StringLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'StringLiteral'
    && typeof (value as { value?: unknown }).value === 'string'
}

function isNumericLiteralNode(value: unknown): value is NumericLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'NumericLiteral'
    && typeof (value as { value?: unknown }).value === 'number'
}

function isBooleanLiteralNode(value: unknown): value is BooleanLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'BooleanLiteral'
    && typeof (value as { value?: unknown }).value === 'boolean'
}

function isNullLiteralNode(value: unknown): value is NullLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'NullLiteral'
}

function isObjectExpressionNode(value: unknown): value is ObjectExpressionLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'ObjectExpression'
    && Array.isArray((value as { properties?: unknown }).properties)
}

function isObjectPropertyNode(value: unknown): value is ObjectPropertyLike {
  if (!value || typeof value !== 'object') {
    return false
  }
  const property = value as { computed?: unknown, key?: unknown, type?: unknown, value?: unknown }
  return property.type === 'ObjectProperty'
    && property.computed !== true
    && (isIdentifierNode(property.key) || isStringLiteralNode(property.key) || isNumericLiteralNode(property.key))
}
