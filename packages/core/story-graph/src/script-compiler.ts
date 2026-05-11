import * as t from '@babel/types'

const STORY_METADATA_DECORATORS = new Set([
  'Chapter',
  'Node',
  'Label',
  'Lane',
  'Route',
  'Timeline',
  'Protagonist',
  'Interaction',
])

export const storyGraphDecoratorMappings = {
  Chapter: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Node: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Label: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Lane: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Route: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Timeline: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Protagonist: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  Interaction: {
    function: 'setStoryMetadataWithEngine',
    module: '@quajs/story-graph',
  },
  EmitStoryEvent: {
    function: 'emitStoryEventWithEngine',
    module: '@quajs/story-graph',
  },
} as const

export function createStoryGraphDecoratorCompiler() {
  return {
    module: '@quajs/story-graph',
    runtimeHelperModules: {
      setStoryMetadataWithEngine: '@quajs/story-graph',
      emitStoryEventWithEngine: '@quajs/story-graph',
    },
    supports(decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/story-graph'
        && (STORY_METADATA_DECORATORS.has(decoratorName) || decoratorName === 'EmitStoryEvent')
    },
    compile({ decorator }: {
      decorator: { name: string, args: unknown[] }
    }) {
      const engineArg = t.memberExpression(t.identifier('ctx'), t.identifier('engine'))
      const args = decorator.args.map(arg => toExpression(arg))

      if (decorator.name === 'EmitStoryEvent') {
        return {
          call: t.callExpression(t.identifier('emitStoryEventWithEngine'), [
            engineArg,
            requireDecoratorArg(decorator, args[0], 'event type'),
            args[1] || t.objectExpression([]),
          ]),
          runtimeHelpers: ['emitStoryEventWithEngine'],
        }
      }

      return {
        call: t.callExpression(t.identifier('setStoryMetadataWithEngine'), [
          engineArg,
          createStoryPointPatch(decorator.name, requireDecoratorArg(decorator, args[0], 'value'), args[1]),
        ]),
        runtimeHelpers: ['setStoryMetadataWithEngine'],
      }
    },
  }
}

export const scriptCompiler = {
  compilers: [createStoryGraphDecoratorCompiler()],
} as const

export const decorators = storyGraphDecoratorMappings

function createStoryPointPatch(name: string, value: t.Expression, metadata?: t.Expression): t.ObjectExpression {
  const property = storyPointPropertyForDecorator(name)
  const properties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier(property), value),
  ]
  if (metadata) {
    properties.push(t.objectProperty(t.identifier('metadata'), metadata))
  }
  return t.objectExpression(properties)
}

function storyPointPropertyForDecorator(name: string): string {
  switch (name) {
    case 'Chapter':
      return 'chapterId'
    case 'Node':
    case 'Label':
    case 'Interaction':
      return 'nodeId'
    case 'Lane':
      return 'laneId'
    case 'Route':
      return 'routeId'
    case 'Timeline':
      return 'timelineId'
    case 'Protagonist':
      return 'protagonistId'
    default:
      return 'nodeId'
  }
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
