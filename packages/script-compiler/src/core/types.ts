/**
 * QuaScript AST node types
 */

export interface QuaScriptDecorator {
  name: string
  args: (string | number | boolean)[]
}

export interface QuaScriptDialogue {
  type: 'dialogue'
  character: string
  text: string
  decorators: QuaScriptDecorator[]
  templateExpressions: string[]
}

export interface QuaScriptStep {
  uuid: string
  type: 'dialogue' | 'action' | 'choice'
  content: QuaScriptDialogue | QuaScriptAction | QuaScriptChoice
}

export interface QuaScriptAction {
  type: 'action'
  decorators: QuaScriptDecorator[]
}

export interface QuaScriptChoice {
  type: 'choice'
  options: Array<{
    text: string
    target: string
    condition?: string
  }>
}

export interface ParsedQuaScript {
  steps: QuaScriptStep[]
  imports: Set<string>
  characters: Set<string>
}

export interface CompilerOptions {
  generateUUID?: boolean
  preserveDecorators?: boolean
  outputFormat?: 'esm' | 'cjs'
}

/**
 * Decorator mapping configuration
 */
export interface DecoratorMapping {
  [decoratorName: string]: {
    function: string
    module: string
    transform?: (args: any[]) => any[]
  }
}

export const DEFAULT_DECORATOR_MAPPINGS: DecoratorMapping = {
  'RunFunction': {
    function: 'runFunction',
    module: '@quajs/engine'
  },
  'PlaySound': {
    function: 'playSound', 
    module: '@quajs/engine'
  },
  'PlayBGM': {
    function: 'playBGM',
    module: '@quajs/engine'
  },
  'Dub': {
    function: 'dub',
    module: '@quajs/engine'
  },
  'UseSprite': {
    function: 'useSprite',
    module: '@quajs/character'
  },
  'UseCharacterSprite': {
    function: 'useCharacterSprite',
    module: '@quajs/character'
  },
  'SetVolume': {
    function: 'setVolume',
    module: '@quajs/engine'
  },
  'SaveToSlot': {
    function: 'saveToSlot',
    module: '@quajs/engine'
  },
  'LoadFromSlot': {
    function: 'loadFromSlot',
    module: '@quajs/engine'
  }
}

/**
 * Merge plugin-extended decorator mappings with default mappings
 */
export function mergeDecoratorMappings(
  pluginMappings: DecoratorMapping = {}
): DecoratorMapping {
  return {
    ...DEFAULT_DECORATOR_MAPPINGS,
    ...pluginMappings
  }
}