import type * as t from '@babel/types'

export const achievementDecoratorMappings = {
  UnlockAchievement: {
    function: 'unlockAchievementWithEngine',
    module: '@quajs/plugin-achievement',
  },
  OpenAchievementBoard: {
    function: 'openAchievementBoardWithEngine',
    module: '@quajs/plugin-achievement',
  },
} as const

export function createAchievementDecoratorCompiler() {
  return {
    module: '@quajs/plugin-achievement',
    runtimeHelperModules: {
      unlockAchievementWithEngine: '@quajs/plugin-achievement',
      openAchievementBoardWithEngine: '@quajs/plugin-achievement',
    },
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      if (mapping.module !== '@quajs/plugin-achievement') {
        return false
      }
      return (
        (decoratorName === 'UnlockAchievement' && mapping.function === 'unlockAchievementWithEngine')
        || (decoratorName === 'OpenAchievementBoard' && mapping.function === 'openAchievementBoardWithEngine')
      )
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = memberExpression(identifier('ctx'), identifier('engine'))

      if (decorator.name === 'UnlockAchievement') {
        const target = requireDecoratorArg(decorator.name, decorator.args[0], 'achievement id or achievement id list')
        const args = [
          engineArg,
          toExpression(target),
        ]
        if (decorator.args[1] !== undefined) {
          args.push(toExpression(decorator.args[1]))
        }
        return {
          call: callExpression(identifier('unlockAchievementWithEngine'), args),
          runtimeHelpers: ['unlockAchievementWithEngine'],
        }
      }

      return {
        call: callExpression(identifier('openAchievementBoardWithEngine'), [
          engineArg,
          decorator.args[0] !== undefined ? toExpression(decorator.args[0]) : objectExpression([]),
        ]),
        runtimeHelpers: ['openAchievementBoardWithEngine'],
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createAchievementDecoratorCompiler()],
} as const

export const decorators = achievementDecoratorMappings

function requireDecoratorArg(name: string, value: unknown, detail: string): unknown {
  if (value === undefined) {
    throw new Error(`@${name} requires ${detail}.`)
  }
  return value
}

function toExpression(value: unknown): t.Expression {
  if (isBabelExpression(value)) {
    return value
  }
  if (typeof value === 'string') {
    return stringLiteral(value)
  }
  if (typeof value === 'number') {
    return numericLiteral(value)
  }
  if (typeof value === 'boolean') {
    return booleanLiteral(value)
  }
  if (value === null) {
    return nullLiteral()
  }
  if (Array.isArray(value)) {
    return arrayExpression(value.map(item => toExpression(item)))
  }
  if (typeof value === 'object') {
    return objectExpression(
      Object.entries(value as Record<string, unknown>).map(([key, item]) =>
        objectProperty(identifier(key), toExpression(item)),
      ),
    )
  }
  return identifier('undefined')
}

function isBabelExpression(value: unknown): value is t.Expression {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && (
    type === 'Identifier'
    || type === 'Super'
    || type === 'Import'
    || type === 'JSXElement'
    || type === 'JSXFragment'
    || type.endsWith('Expression')
    || type.endsWith('Literal')
  )
}

function identifier(name: string): t.Identifier {
  return { type: 'Identifier', name } as t.Identifier
}

function memberExpression(object: t.Expression, property: t.Expression): t.MemberExpression {
  return { type: 'MemberExpression', object, property, computed: false } as t.MemberExpression
}

function callExpression(callee: t.Expression, args: t.Expression[]): t.CallExpression {
  return { type: 'CallExpression', callee, arguments: args } as t.CallExpression
}

function stringLiteral(value: string): t.StringLiteral {
  return { type: 'StringLiteral', value } as t.StringLiteral
}

function numericLiteral(value: number): t.NumericLiteral {
  return { type: 'NumericLiteral', value } as t.NumericLiteral
}

function booleanLiteral(value: boolean): t.BooleanLiteral {
  return { type: 'BooleanLiteral', value } as t.BooleanLiteral
}

function nullLiteral(): t.NullLiteral {
  return { type: 'NullLiteral' } as t.NullLiteral
}

function arrayExpression(elements: t.Expression[]): t.ArrayExpression {
  return { type: 'ArrayExpression', elements } as t.ArrayExpression
}

function objectExpression(properties: t.ObjectProperty[]): t.ObjectExpression {
  return { type: 'ObjectExpression', properties } as t.ObjectExpression
}

function objectProperty(key: t.Expression, value: t.Expression): t.ObjectProperty {
  return { type: 'ObjectProperty', key, value, computed: false, shorthand: false } as t.ObjectProperty
}
