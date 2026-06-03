import * as t from '@babel/types'
import { characterDecoratorMappings } from './decorators'

const SUPPORTED_FUNCTIONS = new Set([
  'sprite',
  'show',
  'hide',
  'move',
  'expression',
  'playCharacterFadeWithEngine',
  'playCharacterEnterWithEngine',
  'playCharacterExitWithEngine',
])

export function createCharacterDecoratorCompiler() {
  return {
    module: '@quajs/character',
    runtimeHelperModules: {
      speakWithEngine: '@quajs/character',
      spriteWithEngine: '@quajs/character',
      showWithEngine: '@quajs/character',
      hideWithEngine: '@quajs/character',
      moveWithEngine: '@quajs/character',
      expressionWithEngine: '@quajs/character',
      playCharacterEnterWithEngine: '@quajs/character/animation',
      playCharacterFadeWithEngine: '@quajs/character/animation',
      playCharacterExitWithEngine: '@quajs/character/animation',
    },
    supports(_decoratorName: string, mapping: { function: string, module: string }) {
      return (
        mapping.module === '@quajs/character'
        || mapping.module === '@quajs/character/animation'
      ) && SUPPORTED_FUNCTIONS.has(mapping.function)
    },
    compile({ decorator, context, mapping }: {
      decorator: { name: string, args: unknown[] }
      context: { characterName?: string }
      mapping: { function: string }
    }) {
      const args = createDecoratorArgs(decorator)
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      switch (mapping.function) {
        case 'sprite': {
          const sprite = requireDecoratorArg(decorator, args[0], 'asset')
          const character = args[1] || requireDecoratorCharacter(decorator, context.characterName)
          return {
            call: t.callExpression(t.identifier('spriteWithEngine'), [
              engineArg,
              character,
              sprite,
            ]),
            runtimeHelpers: ['spriteWithEngine'],
          }
        }
        case 'show': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          return {
            call: t.callExpression(t.identifier('showWithEngine'), [
              engineArg,
              character,
              createCharacterOptionsObject(args.slice(1)),
            ]),
            runtimeHelpers: ['showWithEngine'],
          }
        }
        case 'hide': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          return {
            call: t.callExpression(t.identifier('hideWithEngine'), [
              engineArg,
              character,
            ]),
            runtimeHelpers: ['hideWithEngine'],
          }
        }
        case 'move': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          return {
            call: t.callExpression(t.identifier('moveWithEngine'), [
              engineArg,
              character,
              createCharacterPositionObject(args.slice(1)),
            ]),
            runtimeHelpers: ['moveWithEngine'],
          }
        }
        case 'expression': {
          const character = args[1] || requireDecoratorCharacter(decorator, context.characterName)
          return {
            call: t.callExpression(t.identifier('expressionWithEngine'), [
              engineArg,
              character,
              args[0] || t.identifier('undefined'),
            ]),
            runtimeHelpers: ['expressionWithEngine'],
          }
        }
        case 'playCharacterFadeWithEngine': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          const from = requireDecoratorArg(decorator, args[1], 'from opacity')
          const to = requireDecoratorArg(decorator, args[2], 'to opacity')
          const duration = args[3]
          const options = createMotionPlayOptionsObject(args.slice(4))
          return {
            call: t.callExpression(t.identifier('playCharacterFadeWithEngine'), [
              engineArg,
              character,
              from,
              to,
              duration || t.identifier('undefined'),
              options,
            ]),
            runtimeHelpers: ['playCharacterFadeWithEngine'],
          }
        }
        case 'playCharacterEnterWithEngine': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          const direction = requireDecoratorArg(decorator, args[1], 'direction')
          return {
            call: t.callExpression(t.identifier('playCharacterEnterWithEngine'), [
              engineArg,
              character,
              direction,
              createMotionPresetOptionsObject(args.slice(2)),
            ]),
            runtimeHelpers: ['playCharacterEnterWithEngine'],
          }
        }
        case 'playCharacterExitWithEngine': {
          const character = args[0] || requireDecoratorCharacter(decorator, context.characterName)
          const direction = requireDecoratorArg(decorator, args[1], 'direction')
          return {
            call: t.callExpression(t.identifier('playCharacterExitWithEngine'), [
              engineArg,
              character,
              direction,
              createMotionPresetOptionsObject(args.slice(2)),
            ]),
            runtimeHelpers: ['playCharacterExitWithEngine'],
          }
        }
        default:
          return null
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createCharacterDecoratorCompiler()],
} as const

export const decorators = characterDecoratorMappings

function createDecoratorArgs(decorator: { args: unknown[] }): t.Expression[] {
  return decorator.args.map(arg => toExpression(arg))
}

function createCharacterOptionsObject(args: t.Expression[]): t.ObjectExpression {
  const properties: t.ObjectProperty[] = []
  const [sprite, expression, x, y, layer] = args

  if (sprite) {
    properties.push(t.objectProperty(t.identifier('sprite'), sprite))
  }
  if (expression) {
    properties.push(t.objectProperty(t.identifier('expression'), expression))
  }
  if (x || y) {
    properties.push(t.objectProperty(
      t.identifier('position'),
      createCharacterPositionObject([x, y]),
    ))
  }
  if (layer) {
    properties.push(t.objectProperty(t.identifier('layer'), layer))
  }

  return t.objectExpression(properties)
}

function createCharacterPositionObject(args: Array<t.Expression | undefined>): t.ObjectExpression {
  const properties: t.ObjectProperty[] = []
  const [x, y, scale, rotation, anchor] = args

  if (x) {
    properties.push(t.objectProperty(t.identifier('x'), x))
  }
  if (y) {
    properties.push(t.objectProperty(t.identifier('y'), y))
  }
  if (scale) {
    properties.push(t.objectProperty(t.identifier('scale'), scale))
  }
  if (rotation) {
    properties.push(t.objectProperty(t.identifier('rotation'), rotation))
  }
  if (anchor) {
    properties.push(t.objectProperty(t.identifier('anchor'), anchor))
  }

  return t.objectExpression(properties)
}

function createMotionPresetOptionsObject(args: Array<t.Expression | undefined>): t.ObjectExpression {
  const [duration, options, wait] = args
  const properties: Array<t.ObjectProperty | t.SpreadElement> = []

  if (options && isOptionsExpression(options)) {
    if (t.isObjectExpression(options)) {
      properties.push(...options.properties.filter((property): property is t.ObjectProperty | t.SpreadElement =>
        t.isObjectProperty(property) || t.isSpreadElement(property),
      ))
    }
    else {
      properties.push(t.spreadElement(options))
    }
  }
  if (duration) {
    properties.push(t.objectProperty(t.identifier('duration'), duration))
  }
  if (wait && isBooleanishExpression(wait)) {
    properties.push(t.objectProperty(t.identifier('wait'), wait))
  }

  return t.objectExpression(properties)
}

function createMotionPlayOptionsObject(args: Array<t.Expression | undefined>): t.ObjectExpression {
  const [optionsOrWait] = args
  if (!optionsOrWait) {
    return t.objectExpression([])
  }
  if (isBooleanishExpression(optionsOrWait)) {
    return t.objectExpression([
      t.objectProperty(t.identifier('wait'), optionsOrWait),
    ])
  }
  if (t.isObjectExpression(optionsOrWait)) {
    return t.objectExpression(optionsOrWait.properties.filter((property): property is t.ObjectProperty | t.SpreadElement =>
      t.isObjectProperty(property) || t.isSpreadElement(property),
    ))
  }
  return t.objectExpression([
    t.spreadElement(optionsOrWait),
  ])
}

function isOptionsExpression(value: t.Expression): boolean {
  return !isBooleanishExpression(value)
}

function isBooleanishExpression(value: t.Expression): boolean {
  return t.isBooleanLiteral(value)
}

function requireDecoratorCharacter(decorator: { name: string }, characterName?: string): t.StringLiteral {
  if (!characterName) {
    throw new Error(`@${decorator.name} requires an explicit character when used outside a dialogue line.`)
  }
  return t.stringLiteral(characterName)
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
