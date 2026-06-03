import * as t from '@babel/types'
import { backgroundDecoratorMappings } from './decorators'

const SUPPORTED_FUNCTIONS = new Set([
  'setBackgroundWithEngine',
  'clearBackgroundWithEngine',
  'setVideoBackgroundWithEngine',
  'setLayeredBackgroundWithEngine',
  'addBackgroundLayerWithEngine',
  'removeBackgroundLayerWithEngine',
  'clearBackgroundLayersWithEngine',
  'transitionBackgroundWithEngine',
  'transitionBackgroundLayerWithEngine',
  'showCgOverlayWithEngine',
  'hideCgOverlayWithEngine',
])

export function createBackgroundDecoratorCompiler() {
  return {
    module: '@quajs/plugin-background',
    runtimeHelperModules: {
      setBackgroundWithEngine: '@quajs/plugin-background',
      clearBackgroundWithEngine: '@quajs/plugin-background',
      setVideoBackgroundWithEngine: '@quajs/plugin-background',
      setLayeredBackgroundWithEngine: '@quajs/plugin-background',
      addBackgroundLayerWithEngine: '@quajs/plugin-background',
      removeBackgroundLayerWithEngine: '@quajs/plugin-background',
      clearBackgroundLayersWithEngine: '@quajs/plugin-background',
      transitionBackgroundWithEngine: '@quajs/plugin-background',
      transitionBackgroundLayerWithEngine: '@quajs/plugin-background',
      showCgOverlayWithEngine: '@quajs/plugin-background',
      hideCgOverlayWithEngine: '@quajs/plugin-background',
    },
    supports(_decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/plugin-background' && SUPPORTED_FUNCTIONS.has(mapping.function)
    },
    compile({ decorator, mapping }: {
      decorator: { name: string, args: unknown[] }
      mapping: { function: string }
    }) {
      const args = createDecoratorArgs(decorator)
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))
      const helper = t.identifier(mapping.function)

      switch (mapping.function) {
        case 'setBackgroundWithEngine': {
          const asset = requireDecoratorArg(decorator, args[0], 'asset')
          return {
            call: t.callExpression(helper, [
              engineArg,
              asset,
              args[1],
            ].filter(Boolean) as t.Expression[]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'clearBackgroundWithEngine':
          return {
            call: t.callExpression(helper, [engineArg]),
            runtimeHelpers: [mapping.function],
          }
        case 'setVideoBackgroundWithEngine': {
          const asset = requireDecoratorArg(decorator, args[0], 'asset')
          return {
            call: t.callExpression(helper, [
              engineArg,
              asset,
              args[1],
            ].filter(Boolean) as t.Expression[]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'setLayeredBackgroundWithEngine':
          return {
            call: t.callExpression(helper, [
              engineArg,
              t.arrayExpression([]),
              args[0],
            ].filter(Boolean) as t.Expression[]),
            runtimeHelpers: [mapping.function],
          }
        case 'addBackgroundLayerWithEngine': {
          const id = requireDecoratorArg(decorator, args[0], 'layer id')
          const asset = requireDecoratorArg(decorator, args[1], 'asset')
          return {
            call: t.callExpression(helper, [
              engineArg,
              createBackgroundLayerObject(id, asset, args[2]),
            ]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'removeBackgroundLayerWithEngine': {
          const id = requireDecoratorArg(decorator, args[0], 'layer id')
          return {
            call: t.callExpression(helper, [engineArg, id]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'clearBackgroundLayersWithEngine':
          return {
            call: t.callExpression(helper, [engineArg]),
            runtimeHelpers: [mapping.function],
          }
        case 'transitionBackgroundWithEngine':
          return {
            call: t.callExpression(helper, [
              engineArg,
              createTransitionObject(args, true),
            ]),
            runtimeHelpers: [mapping.function],
          }
        case 'transitionBackgroundLayerWithEngine': {
          const id = requireDecoratorArg(decorator, args[0], 'layer id')
          return {
            call: t.callExpression(helper, [
              engineArg,
              id,
              createTransitionObject(args.slice(1), true),
            ]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'showCgOverlayWithEngine': {
          const asset = requireDecoratorArg(decorator, args[0], 'asset')
          return {
            call: t.callExpression(helper, [
              engineArg,
              asset,
              args[1],
            ].filter(Boolean) as t.Expression[]),
            runtimeHelpers: [mapping.function],
          }
        }
        case 'hideCgOverlayWithEngine':
          return {
            call: t.callExpression(helper, [
              engineArg,
              args[0],
            ].filter(Boolean) as t.Expression[]),
            runtimeHelpers: [mapping.function],
          }
        default:
          return null
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createBackgroundDecoratorCompiler()],
} as const

export const decorators = backgroundDecoratorMappings

function createDecoratorArgs(decorator: { args: unknown[] }): t.Expression[] {
  return decorator.args.map(arg => toExpression(arg))
}

function createTransitionObject(args: Array<t.Expression | undefined>, required: true): t.ObjectExpression
function createTransitionObject(args: Array<t.Expression | undefined>, required?: false): t.ObjectExpression | undefined
function createTransitionObject(args: Array<t.Expression | undefined>, required = false): t.ObjectExpression | undefined {
  const [type, duration, easing] = args
  if (!type) {
    if (required) {
      return t.objectExpression([
        t.objectProperty(t.identifier('type'), t.stringLiteral('instant')),
      ])
    }
    return undefined
  }

  const properties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('type'), type),
  ]
  if (duration) {
    properties.push(t.objectProperty(t.identifier('duration'), duration))
  }
  if (easing) {
    properties.push(t.objectProperty(t.identifier('easing'), easing))
  }
  return t.objectExpression(properties)
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

function createBackgroundLayerObject(
  id: t.Expression,
  assetName: t.Expression,
  options: t.Expression | undefined,
): t.ObjectExpression {
  const properties: Array<t.ObjectProperty | t.SpreadElement> = [
    t.objectProperty(t.identifier('id'), id),
    t.objectProperty(t.identifier('assetName'), assetName),
  ]

  if (options) {
    if (t.isObjectExpression(options)) {
      properties.push(...options.properties.filter((property): property is t.ObjectProperty | t.SpreadElement =>
        t.isObjectProperty(property) || t.isSpreadElement(property),
      ))
    }
    else {
      properties.push(t.spreadElement(options))
    }
  }

  return t.objectExpression(properties)
}

function requireDecoratorArg(decorator: { name: string }, arg: t.Expression | undefined, name: string): t.Expression {
  if (!arg) {
    throw new Error(`@${decorator.name} requires ${name}.`)
  }
  return arg
}
