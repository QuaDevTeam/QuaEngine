import * as t from '@babel/types'
import { galleryDecoratorMappings } from './decorators'

export { galleryDecoratorMappings } from './decorators'

export function createGalleryDecoratorCompiler() {
  return {
    module: '@quajs/plugin-gallery',
    runtimeHelperModules: {
      unlockGalleryEntryWithEngine: '@quajs/plugin-gallery',
      openGallerySceneWithEngine: '@quajs/plugin-gallery',
    },
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      if (mapping.module !== '@quajs/plugin-gallery') {
        return false
      }
      return (
        (decoratorName === 'UnlockGallery' && mapping.function === 'unlockGalleryEntryWithEngine')
        || (decoratorName === 'OpenGalleryScene' && mapping.function === 'openGallerySceneWithEngine')
      )
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      if (decorator.name === 'UnlockGallery') {
        const target = requireDecoratorArg(decorator.name, decorator.args[0], 'entry id or entry id list')
        const args = [
          engineArg,
          toExpression(target),
        ]
        if (decorator.args[1] !== undefined) {
          args.push(toExpression(decorator.args[1]))
        }
        return {
          call: t.callExpression(t.identifier('unlockGalleryEntryWithEngine'), args),
          runtimeHelpers: ['unlockGalleryEntryWithEngine'],
        }
      }

      return {
        call: t.callExpression(t.identifier('openGallerySceneWithEngine'), [
          engineArg,
          decorator.args[0] !== undefined ? toExpression(decorator.args[0]) : t.objectExpression([]),
        ]),
        runtimeHelpers: ['openGallerySceneWithEngine'],
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createGalleryDecoratorCompiler()],
} as const

export const decorators = galleryDecoratorMappings

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
