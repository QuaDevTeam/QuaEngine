import * as t from '@babel/types'

const SUPPORTED_FUNCTIONS = new Set(['sprite', 'show', 'hide', 'move', 'expression'])

export const characterDecoratorMappings = {
  SetSprite: {
    function: 'sprite',
    module: '@quajs/character',
  },
  ShowCharacter: {
    function: 'show',
    module: '@quajs/character',
  },
  HideCharacter: {
    function: 'hide',
    module: '@quajs/character',
  },
  MoveCharacter: {
    function: 'move',
    module: '@quajs/character',
  },
  SetExpression: {
    function: 'expression',
    module: '@quajs/character',
  },
} as const

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
    },
    supports(_decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/character' && SUPPORTED_FUNCTIONS.has(mapping.function)
    },
    compile({ decorator, context, mapping }: {
      decorator: { name: string, args: (string | number | boolean)[] }
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

function createDecoratorArgs(decorator: { args: (string | number | boolean)[] }): t.Expression[] {
  return decorator.args.map((arg) => {
    if (typeof arg === 'string') {
      return t.stringLiteral(arg)
    }
    if (typeof arg === 'number') {
      return t.numericLiteral(arg)
    }
    return t.booleanLiteral(arg)
  })
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
