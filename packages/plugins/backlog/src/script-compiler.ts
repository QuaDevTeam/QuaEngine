import * as t from '@babel/types'
import { backlogDecoratorMappings } from './decorators'

export function createBacklogDecoratorCompiler() {
  return {
    module: '@quajs/plugin-backlog',
    runtimeHelperModules: {
      setBacklogPolicyWithEngine: '@quajs/plugin-backlog',
    },
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/plugin-backlog'
        && mapping.function === 'setBacklogPolicyWithEngine'
        && (decoratorName === 'Backlog' || decoratorName === 'NoBacklog')
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const policy = decorator.name === 'NoBacklog'
        ? t.objectExpression([t.objectProperty(t.identifier('include'), t.booleanLiteral(false))])
        : toExpression(decorator.args[0] || {})
      return {
        call: t.callExpression(t.identifier('setBacklogPolicyWithEngine'), [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          policy,
        ]),
        runtimeHelpers: ['setBacklogPolicyWithEngine'],
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createBacklogDecoratorCompiler()],
} as const

export const decorators = backlogDecoratorMappings

function toExpression(value: unknown): t.Expression {
  if (isBabelExpression(value)) {
    return value
  }
  if (typeof value === 'string') {
    return t.stringLiteral(value)
  }
  if (typeof value === 'number') {
    return t.numericLiteral(value)
  }
  if (typeof value === 'boolean') {
    return t.booleanLiteral(value)
  }
  if (value === null) {
    return t.nullLiteral()
  }
  if (Array.isArray(value)) {
    return t.arrayExpression(value.map(item => toExpression(item)))
  }
  if (typeof value === 'object') {
    return t.objectExpression(
      Object.entries(value as Record<string, unknown>).map(([key, item]) =>
        t.objectProperty(t.identifier(key), toExpression(item)),
      ),
    )
  }
  return t.objectExpression([])
}

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}
