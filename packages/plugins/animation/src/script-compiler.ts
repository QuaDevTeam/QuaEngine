import * as t from '@babel/types'
import { animationDecoratorMappings } from './decorators'

export { animationDecoratorMappings } from './decorators'

const SUPPORTED_FUNCTIONS = new Set([
  'registerAnimationWithEngine',
  'playTimelineWithEngine',
  'playAnimationWithEngine',
  'defineAnimationKeyframe',
])

export function createAnimationDecoratorCompiler() {
  return {
    module: '@quajs/plugin-animation',
    runtimeHelperModules: {
      registerAnimationWithEngine: '@quajs/plugin-animation',
      playTimelineWithEngine: '@quajs/plugin-animation',
      playAnimationWithEngine: '@quajs/plugin-animation',
    },
    supports(_decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/plugin-animation' && SUPPORTED_FUNCTIONS.has(mapping.function)
    },
    compile({ decorator, decorators, index, context }: {
      decorator: { name: string, args: unknown[] }
      decorators: { name: string, args: unknown[] }[]
      index: number
      context: { characterName?: string }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      if (decorator.name === 'Key') {
        throw new Error('@Key requires a preceding @DefineAnimation or @AnimationTimeline decorator.')
      }

      if (decorator.name === 'DefineAnimation' || decorator.name === 'AnimationTimeline') {
        const keys: { name: string, args: unknown[] }[] = []
        let nextIndex = index

        while (decorators[nextIndex + 1]?.name === 'Key') {
          keys.push(decorators[nextIndex + 1])
          nextIndex += 1
        }

        const args = createDecoratorArgs(decorator)
        const duration = requireDecoratorArg(decorator, args[decorator.name === 'DefineAnimation' ? 1 : 0], 'duration')
        const wait = args[args.length - 1]

        if (decorator.name === 'DefineAnimation') {
          const id = requireDecoratorArg(decorator, args[0], 'animation id')
          return {
            call: t.callExpression(t.identifier('registerAnimationWithEngine'), [
              engineArg,
              createAnimationTimelineObject({
                id,
                duration,
                keys,
                allowOmittedTarget: true,
              }),
            ]),
            nextIndex,
            runtimeHelpers: ['registerAnimationWithEngine'],
          }
        }

        return {
          call: t.callExpression(t.identifier('playTimelineWithEngine'), [
            engineArg,
            createAnimationTimelineObject({
              duration,
              keys,
              allowOmittedTarget: Boolean(context.characterName),
            }),
            createAnimationPlayOptionsObject({
              defaultTarget: createDefaultSelfTarget(context),
              wait: isBooleanLiteral(wait) ? wait : undefined,
            }),
          ]),
          nextIndex,
          runtimeHelpers: ['playTimelineWithEngine'],
        }
      }

      if (decorator.name === 'PlayAnimation') {
        const args = createDecoratorArgs(decorator)
        const id = requireDecoratorArg(decorator, args[0], 'animation id')
        const wait = args[args.length - 1]
        const bindingArgs = args.slice(1, isBooleanLiteral(wait) ? -1 : undefined)

        return {
          call: t.callExpression(t.identifier('playAnimationWithEngine'), [
            engineArg,
            id,
            createAnimationPlayOptionsObject({
              bindings: bindingArgs,
              defaultTarget: createDefaultSelfTarget(context),
              wait: isBooleanLiteral(wait) ? wait : undefined,
            }),
          ]),
          runtimeHelpers: ['playAnimationWithEngine'],
        }
      }

      return null
    },
  }
}

export const scriptCompiler = {
  compilers: [createAnimationDecoratorCompiler()],
} as const

export const decorators = animationDecoratorMappings

function createDecoratorArgs(decorator: { args: unknown[] }): t.Expression[] {
  return decorator.args.map(arg => toExpression(arg))
}

function createAnimationTimelineObject(options: {
  id?: t.Expression
  duration: t.Expression
  keys: { name: string, args: unknown[] }[]
  allowOmittedTarget: boolean
}): t.ObjectExpression {
  const properties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('duration'), options.duration),
    t.objectProperty(t.identifier('tracks'), t.arrayExpression(options.keys.map(key =>
      createAnimationTrackObject(key, options.allowOmittedTarget),
    ))),
  ]

  if (options.id) {
    properties.unshift(t.objectProperty(t.identifier('id'), options.id))
  }

  return t.objectExpression(properties)
}

function createAnimationTrackObject(
  decorator: { name: string, args: unknown[] },
  allowOmittedTarget: boolean,
): t.ObjectExpression {
  const args = createDecoratorArgs(decorator)
  const hasExplicitTarget = args.length >= 4

  if (!hasExplicitTarget && !allowOmittedTarget) {
    throw new Error('@Key with an omitted target is ambiguous outside a dialogue line. Use @Key(\'target\', \'property\', at, value).')
  }

  const target = hasExplicitTarget ? args[0] : t.stringLiteral('self')
  const property = requireDecoratorArg(decorator, hasExplicitTarget ? args[1] : args[0], 'property')
  const at = requireDecoratorArg(decorator, hasExplicitTarget ? args[2] : args[1], 'time')
  const value = requireDecoratorArg(decorator, hasExplicitTarget ? args[3] : args[2], 'value')
  const easing = hasExplicitTarget ? args[4] : args[3]

  return t.objectExpression([
    t.objectProperty(t.identifier('target'), target),
    t.objectProperty(t.identifier('property'), property),
    t.objectProperty(t.identifier('keyframes'), t.arrayExpression([
      t.objectExpression([
        t.objectProperty(t.identifier('at'), at),
        t.objectProperty(t.identifier('value'), value),
        ...(easing ? [t.objectProperty(t.identifier('easing'), easing)] : []),
      ]),
    ])),
  ])
}

function createAnimationPlayOptionsObject(options: {
  bindings?: t.Expression[]
  defaultTarget?: t.Expression
  wait?: t.BooleanLiteral
}): t.ObjectExpression {
  const properties: t.ObjectProperty[] = []
  const bindings = options.bindings?.filter(binding => t.isStringLiteral(binding)) || []

  if (bindings.length > 0) {
    properties.push(t.objectProperty(t.identifier('bindings'), t.arrayExpression(bindings)))
  }
  if (options.defaultTarget) {
    properties.push(t.objectProperty(t.identifier('defaultTarget'), options.defaultTarget))
  }
  if (options.wait !== undefined) {
    properties.push(t.objectProperty(t.identifier('wait'), options.wait))
  }

  return t.objectExpression(properties)
}

function createDefaultSelfTarget(context: { characterName?: string }): t.StringLiteral | undefined {
  return context.characterName ? t.stringLiteral(`character:${context.characterName}`) : undefined
}

function requireDecoratorArg(decorator: { name: string }, arg: t.Expression | undefined, name: string): t.Expression {
  if (!arg) {
    throw new Error(`@${decorator.name} requires ${name}.`)
  }
  return arg
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

function isBooleanLiteral(expr: t.Expression | undefined): expr is t.BooleanLiteral {
  return Boolean(expr && t.isBooleanLiteral(expr))
}
