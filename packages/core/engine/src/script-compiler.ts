import * as t from '@babel/types'

const POLICY_DECORATORS = new Set([
  'FlowControl',
  'FlowControlPolicy',
  'Skippable',
  'NoSkip',
  'Forwardable',
  'NoForward',
  'AutoAdvanceable',
  'NoAutoAdvance',
])

const RESET_DECORATORS = new Set(['ResetFlowControlPolicy'])

export const flowControlDecoratorMappings = {
  FlowControl: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  FlowControlPolicy: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  ResetFlowControlPolicy: {
    function: 'resetFlowControlPolicy',
    module: '@quajs/engine',
  },
  Skippable: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  NoSkip: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  Forwardable: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  NoForward: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  AutoAdvanceable: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
  NoAutoAdvance: {
    function: 'setFlowControlPolicy',
    module: '@quajs/engine',
  },
} as const

export function createFlowControlDecoratorCompiler() {
  return {
    module: '@quajs/engine',
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/engine'
        && (
          (mapping.function === 'setFlowControlPolicy' && POLICY_DECORATORS.has(decoratorName))
          || (mapping.function === 'resetFlowControlPolicy' && RESET_DECORATORS.has(decoratorName))
        )
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      if (RESET_DECORATORS.has(decorator.name)) {
        return {
          call: t.callExpression(
            t.memberExpression(engineArg, t.identifier('resetFlowControlPolicy')),
            [],
          ),
        }
      }

      return {
        call: t.callExpression(
          t.memberExpression(engineArg, t.identifier('setFlowControlPolicy')),
          [createPolicyObject(decorator)],
        ),
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createFlowControlDecoratorCompiler()],
} as const

export const decorators = flowControlDecoratorMappings

function createPolicyObject(decorator: { name: string, args: unknown[] }): t.Expression {
  switch (decorator.name) {
    case 'FlowControl':
    case 'FlowControlPolicy':
      return toExpression(decorator.args[0] || {})
    case 'Skippable':
      return t.objectExpression([
        t.objectProperty(t.identifier('skippable'), toExpression(decorator.args[0] ?? true)),
      ])
    case 'NoSkip':
      return t.objectExpression([
        t.objectProperty(t.identifier('skippable'), t.booleanLiteral(false)),
      ])
    case 'Forwardable':
      return t.objectExpression([
        t.objectProperty(t.identifier('fastForwardable'), toExpression(decorator.args[0] ?? true)),
      ])
    case 'NoForward':
      return t.objectExpression([
        t.objectProperty(t.identifier('fastForwardable'), t.booleanLiteral(false)),
      ])
    case 'AutoAdvanceable':
      return t.objectExpression([
        t.objectProperty(t.identifier('autoAdvanceable'), toExpression(decorator.args[0] ?? true)),
      ])
    case 'NoAutoAdvance':
      return t.objectExpression([
        t.objectProperty(t.identifier('autoAdvanceable'), t.booleanLiteral(false)),
      ])
    default:
      return t.objectExpression([])
  }
}

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
