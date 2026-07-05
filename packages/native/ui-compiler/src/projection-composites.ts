import type {
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiProp,
} from './types'
import { numberProp, propString } from './projection-props'
import {
  evaluateQuiExpression,
  templateStringProp,
  templateStringValue,
  type NativeUiTemplateScope,
} from './projection-template'

export interface NativeQuiSlotContent {
  nodes: readonly NativeQuiAstNode[]
  source: string
}

export interface NativeQuiCompositeExpansion {
  component: NativeQuiDocument
  componentStack: readonly string[]
  scope: NativeUiTemplateScope
  slots: Readonly<Record<string, NativeQuiSlotContent>>
}

const COMPOSITE_CONTROL_PROPS = new Set(['else', 'else-if', 'for', 'if', 'key'])

export function compositeExpansionForNode(
  source: string,
  node: NativeQuiAstNode,
  component: NativeQuiDocument,
  scope: NativeUiTemplateScope,
  componentStack: readonly string[],
): NativeQuiCompositeExpansion {
  const props = compositePropBindings(node, scope)
  return {
    component,
    componentStack: [...componentStack, node.name],
    scope: compositeScopeForNode(node, {
      ...scope,
      context: {
        ...(scope.context || {}),
        props,
      },
    }),
    slots: slotContentFromCompositeInvocation(source, node),
  }
}

export function scopedNumberPropResolver(scope: NativeUiTemplateScope) {
  return (props: readonly NativeQuiProp[], name: string): number | undefined => {
    const prop = props.find(item => item.name === name)
    if (!prop?.value)
      return undefined

    const evaluated = evaluateQuiExpression(prop.value, scope)
    const number = Number(evaluated ?? propString(props, name))
    return Number.isFinite(number) ? number : numberProp(props, name)
  }
}

function compositePropBindings(
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const prop of node.props) {
    if (COMPOSITE_CONTROL_PROPS.has(prop.name))
      continue

    if (prop.value === undefined) {
      props[prop.name] = true
      continue
    }

    const evaluated = evaluateQuiExpression(prop.value, scope)
    props[prop.name] = evaluated === undefined
      ? templateStringValue(prop.value, scope) ?? prop.value.trim()
      : evaluated
  }
  return props
}

function compositeScopeForNode(
  node: NativeQuiAstNode,
  scope: NativeUiTemplateScope,
): NativeUiTemplateScope {
  const key = templateStringProp(node.props, 'key', scope)
  if (!key || key === scope.currentLoopKey)
    return scope
  return {
    ...scope,
    currentLoopKey: key,
    idSuffix: appendCompositeIdSuffix(scope.idSuffix, key),
  }
}

function appendCompositeIdSuffix(parent: string | undefined, key: string): string {
  return parent ? `${parent}.${key}` : key
}

function slotContentFromCompositeInvocation(
  source: string,
  node: NativeQuiAstNode,
): Readonly<Record<string, NativeQuiSlotContent>> {
  const slots: Record<string, NativeQuiSlotContent> = {}
  const defaultNodes: NativeQuiAstNode[] = []

  for (const child of node.children) {
    if (child.kind === 'slot') {
      slots[child.name] = {
        nodes: child.children,
        source,
      }
      continue
    }
    defaultNodes.push(child)
  }

  if (defaultNodes.length > 0) {
    slots.default = {
      nodes: defaultNodes,
      source,
    }
  }

  return slots
}
