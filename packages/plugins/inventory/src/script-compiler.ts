import * as t from '@babel/types'

export const inventoryDecoratorMappings = {
  GrantInventoryItem: {
    function: 'grantInventoryItemWithEngine',
    module: '@quajs/plugin-inventory',
  },
  ConsumeInventoryItem: {
    function: 'consumeInventoryItemWithEngine',
    module: '@quajs/plugin-inventory',
  },
  SetInventoryItemQuantity: {
    function: 'setInventoryItemQuantityWithEngine',
    module: '@quajs/plugin-inventory',
  },
} as const

export function createInventoryDecoratorCompiler() {
  return {
    module: '@quajs/plugin-inventory',
    runtimeHelperModules: {
      grantInventoryItemWithEngine: '@quajs/plugin-inventory',
      consumeInventoryItemWithEngine: '@quajs/plugin-inventory',
      setInventoryItemQuantityWithEngine: '@quajs/plugin-inventory',
    },
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      if (mapping.module !== '@quajs/plugin-inventory') {
        return false
      }
      return (
        (decoratorName === 'GrantInventoryItem' && mapping.function === 'grantInventoryItemWithEngine')
        || (decoratorName === 'ConsumeInventoryItem' && mapping.function === 'consumeInventoryItemWithEngine')
        || (decoratorName === 'SetInventoryItemQuantity' && mapping.function === 'setInventoryItemQuantityWithEngine')
      )
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))

      if (decorator.name === 'SetInventoryItemQuantity') {
        const args = [
          engineArg,
          toExpression(requireDecoratorArg(decorator.name, decorator.args[0], 'item id')),
          toExpression(requireDecoratorArg(decorator.name, decorator.args[1], 'quantity')),
        ]
        if (decorator.args[2] !== undefined) {
          args.push(toExpression(decorator.args[2]))
        }
        return {
          call: t.callExpression(t.identifier('setInventoryItemQuantityWithEngine'), args),
          runtimeHelpers: ['setInventoryItemQuantityWithEngine'],
        }
      }

      const helper = decorator.name === 'ConsumeInventoryItem'
        ? 'consumeInventoryItemWithEngine'
        : 'grantInventoryItemWithEngine'
      const args = [
        engineArg,
        toExpression(requireDecoratorArg(decorator.name, decorator.args[0], 'item id')),
      ]
      if (decorator.args[1] !== undefined) {
        args.push(toExpression(decorator.args[1]))
      }
      return {
        call: t.callExpression(t.identifier(helper), args),
        runtimeHelpers: [helper],
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createInventoryDecoratorCompiler()],
} as const

export const decorators = inventoryDecoratorMappings

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
