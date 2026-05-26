import * as t from '@babel/types'

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
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

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
          call: t.callExpression(t.identifier('unlockAchievementWithEngine'), args),
          runtimeHelpers: ['unlockAchievementWithEngine'],
        }
      }

      return {
        call: t.callExpression(t.identifier('openAchievementBoardWithEngine'), [
          engineArg,
          decorator.args[0] !== undefined ? toExpression(decorator.args[0]) : t.objectExpression([]),
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
  return t.identifier('undefined')
}

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}
