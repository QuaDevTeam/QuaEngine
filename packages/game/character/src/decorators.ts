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
  CharacterFade: {
    function: 'playCharacterFadeWithEngine',
    module: '@quajs/character/animation',
  },
  CharacterEnter: {
    function: 'playCharacterEnterWithEngine',
    module: '@quajs/character/animation',
  },
  CharacterExit: {
    function: 'playCharacterExitWithEngine',
    module: '@quajs/character/animation',
  },
} as const

export const decorators = characterDecoratorMappings
