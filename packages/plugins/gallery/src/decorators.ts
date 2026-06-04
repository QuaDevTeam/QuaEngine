export const galleryDecoratorMappings = {
  UnlockGallery: {
    function: 'unlockGalleryEntryWithEngine',
    module: '@quajs/plugin-gallery',
  },
  OpenGalleryScene: {
    function: 'openGallerySceneWithEngine',
    module: '@quajs/plugin-gallery',
  },
} as const

export const decorators = galleryDecoratorMappings
