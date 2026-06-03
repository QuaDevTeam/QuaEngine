export const animationDecoratorMappings = {
  DefineAnimation: {
    function: 'registerAnimationWithEngine',
    module: '@quajs/plugin-animation',
  },
  AnimationTimeline: {
    function: 'playTimelineWithEngine',
    module: '@quajs/plugin-animation',
  },
  Key: {
    function: 'defineAnimationKeyframe',
    module: '@quajs/plugin-animation',
  },
  PlayAnimation: {
    function: 'playAnimationWithEngine',
    module: '@quajs/plugin-animation',
  },
} as const

export const decorators = animationDecoratorMappings
