export const backgroundDecoratorMappings = {
  SetBackground: {
    function: 'setBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  ClearBackground: {
    function: 'clearBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  VideoBackground: {
    function: 'setVideoBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  SetLayeredBackground: {
    function: 'setLayeredBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundLayer: {
    function: 'addBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
  RemoveBackgroundLayer: {
    function: 'removeBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
  ClearBackgroundLayers: {
    function: 'clearBackgroundLayersWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundTransition: {
    function: 'transitionBackgroundWithEngine',
    module: '@quajs/plugin-background',
  },
  BackgroundLayerTransition: {
    function: 'transitionBackgroundLayerWithEngine',
    module: '@quajs/plugin-background',
  },
  ShowCgOverlay: {
    function: 'showCgOverlayWithEngine',
    module: '@quajs/plugin-background',
  },
  HideCgOverlay: {
    function: 'hideCgOverlayWithEngine',
    module: '@quajs/plugin-background',
  },
} as const

export const decorators = backgroundDecoratorMappings
