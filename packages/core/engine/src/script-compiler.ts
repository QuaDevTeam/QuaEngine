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

const ROLLBACK_DECORATORS = new Set([
  'RollbackAnchor',
  'RollbackBoundary',
  'FixRollback',
  'NoRollback',
])

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

export const rollbackDecoratorMappings = {
  RollbackAnchor: {
    function: 'createRollbackAnchor',
    module: '@quajs/engine',
  },
  RollbackBoundary: {
    function: 'markRollbackBoundary',
    module: '@quajs/engine',
  },
  FixRollback: {
    function: 'fixRollback',
    module: '@quajs/engine',
  },
  NoRollback: {
    function: 'markRollbackBoundary',
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

export function createRollbackDecoratorCompiler() {
  return {
    module: '@quajs/engine',
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/engine'
        && ROLLBACK_DECORATORS.has(decoratorName)
        && (
          mapping.function === 'createRollbackAnchor'
          || mapping.function === 'markRollbackBoundary'
          || mapping.function === 'fixRollback'
        )
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      if (decorator.name === 'NoRollback') {
        return {
          call: t.callExpression(
            t.memberExpression(engineArg, t.identifier('markRollbackBoundary')),
            [t.stringLiteral('no-rollback')],
          ),
        }
      }

      if (decorator.name === 'FixRollback') {
        return {
          call: t.callExpression(
            t.memberExpression(engineArg, t.identifier('fixRollback')),
            decorator.args.length > 0 ? [toExpression(decorator.args[0])] : [],
          ),
        }
      }

      const method = decorator.name === 'RollbackAnchor'
        ? 'createRollbackAnchor'
        : 'markRollbackBoundary'
      return {
        call: t.callExpression(
          t.memberExpression(engineArg, t.identifier(method)),
          decorator.args.map(arg => toExpression(arg)),
        ),
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createFlowControlDecoratorCompiler(), createRollbackDecoratorCompiler()],
} as const

export const decorators = {
  ...flowControlDecoratorMappings,
  ...rollbackDecoratorMappings,
}

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
        t.objectProperty(createObjectKey(key), toExpression(item)),
      ),
    )
  }
  return t.objectExpression([])
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}
