import type {
  NativeQuiAstNode,
  NativeQuiProp,
} from './types'
import {
  evaluateQuiExpression,
  templateStringValue,
  type NativeUiTemplateScope,
} from './projection-template'

export interface NativeQuiLoopIteration {
  scope: NativeUiTemplateScope
}

export type NativeQuiConditionalBranch = 'else' | 'else-if' | 'if'

interface QuiForExpression {
  indexName?: string
  itemName: string
  source: string
}

const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`
const FOR_PATTERN = new RegExp(
  String.raw`^\s*(?:(${IDENTIFIER})|\(\s*(${IDENTIFIER})(?:\s*,\s*(${IDENTIFIER}))?\s*\))\s+in\s+([\s\S]+?)\s*$`,
)

export function conditionalBranch(node: NativeQuiAstNode): NativeQuiConditionalBranch | undefined {
  if (propByName(node.props, 'if'))
    return 'if'
  if (propByName(node.props, 'else-if'))
    return 'else-if'
  if (propByName(node.props, 'else'))
    return 'else'
  return undefined
}

export function conditionalBranchValue(node: NativeQuiAstNode, branch: NativeQuiConditionalBranch): string | undefined {
  return propByName(node.props, branch)?.value
}

export function evaluateQuiCondition(
  expression: string | undefined,
  scope: NativeUiTemplateScope,
): boolean | undefined {
  if (!expression)
    return undefined
  const value = evaluateQuiExpression(expression, scope)
  return value === undefined ? undefined : Boolean(value)
}

export function loopIterationsForNode(
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): NativeQuiLoopIteration[] | undefined {
  const forValue = propByName(node.props, 'for')?.value
  if (!forValue)
    return undefined

  const parsed = parseForExpression(forValue)
  if (!parsed)
    return undefined

  const source = evaluateQuiExpression(parsed.source, scope)
  if (!Array.isArray(source)) {
    if (!scope.hasContext && source === undefined)
      return [{ scope }]
    return []
  }

  const keyProp = propByName(node.props, 'key')
  return source.map((item, index) => {
    const bindings = {
      ...(scope.bindings || {}),
      [parsed.itemName]: item,
      ...(parsed.indexName ? { [parsed.indexName]: index } : {}),
    }
    const iterationScope: NativeUiTemplateScope = {
      ...scope,
      bindings,
    }
    const key = templateStringValue(keyProp?.value, iterationScope)
      ?? String(index)
    return {
      scope: {
        ...iterationScope,
        currentLoopKey: key,
        idSuffix: appendIdSuffix(scope.idSuffix, key),
      },
    }
  })
}

function parseForExpression(expression: string): QuiForExpression | undefined {
  const match = FOR_PATTERN.exec(expression)
  if (!match)
    return undefined
  return {
    itemName: match[1] || match[2],
    indexName: match[3],
    source: match[4],
  }
}

function propByName(props: readonly NativeQuiProp[], name: string): NativeQuiProp | undefined {
  return props.find(prop => prop.name === name)
}

function appendIdSuffix(parent: string | undefined, key: string): string {
  return parent ? `${parent}.${key}` : key
}
