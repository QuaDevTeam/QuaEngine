import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererPlugin } from './core'
import { createAudioWebRendererPlugin } from './audio'
import { createBackgroundWebRendererPlugin } from './background'
import { createBacklogWebRendererPlugin } from './backlog'
import { createCharacterWebRendererPlugin } from './character'
import { createChoicesWebRendererPlugin } from './choices'
import { createDialogueWebRendererPlugin } from './dialogue'
import { createEffectsWebRendererPlugin } from './effects'
import { createSceneWebRendererPlugin } from './scene'
import { createSpriteCharacterRenderer, createSpriteWebRendererPlugin } from './sprite'
import { createUiWebRendererPlugin } from './ui'

export function createVisualNovelWebRendererPlugins(): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  const renderSprite = createSpriteCharacterRenderer()
  return [
    createBackgroundWebRendererPlugin(),
    createSpriteWebRendererPlugin(),
    createCharacterWebRendererPlugin({ renderSprite }),
    createEffectsWebRendererPlugin(),
    createDialogueWebRendererPlugin(),
    createChoicesWebRendererPlugin(),
    createAudioWebRendererPlugin(),
    createSceneWebRendererPlugin(),
    createUiWebRendererPlugin(),
    createBacklogWebRendererPlugin(),
  ]
}
