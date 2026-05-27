import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererPlugin } from './core'
import type { InputWebRendererPluginOptions } from './input'
import { createAchievementWebRendererPlugin } from './achievement'
import { createAudioWebRendererPlugin } from './audio'
import { createBackgroundWebRendererPlugin } from './background'
import { createBacklogWebRendererPlugin } from './backlog'
import { createCharacterWebRendererPlugin } from './character'
import { createChoicesWebRendererPlugin } from './choices'
import { createDialogueWebRendererPlugin } from './dialogue'
import { createEffectsWebRendererPlugin } from './effects'
import { createFontsWebRendererPlugin } from './fonts'
import { createGalleryWebRendererPlugin } from './gallery'
import { createInputWebRendererPlugin } from './input'
import { createSceneWebRendererPlugin } from './scene'
import { createSettingsWebRendererPlugin } from './settings'
import { createSpriteCharacterRenderer, createSpriteWebRendererPlugin } from './sprite'
import { createUiWebRendererPlugin } from './ui'

export interface VisualNovelWebRendererPresetOptions {
  input?: false | InputWebRendererPluginOptions
}

export function createVisualNovelWebRendererPlugins(options: VisualNovelWebRendererPresetOptions = {}): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  const renderSprite = createSpriteCharacterRenderer()
  return [
    ...(options.input === false ? [] : [createInputWebRendererPlugin(options.input || {})]),
    createFontsWebRendererPlugin(),
    createBackgroundWebRendererPlugin(),
    createSpriteWebRendererPlugin(),
    createCharacterWebRendererPlugin({ renderSprite }),
    createEffectsWebRendererPlugin(),
    createDialogueWebRendererPlugin(),
    createChoicesWebRendererPlugin(),
    createAudioWebRendererPlugin(),
    createSceneWebRendererPlugin(),
    createUiWebRendererPlugin(),
    createSettingsWebRendererPlugin(),
    createBacklogWebRendererPlugin(),
    createGalleryWebRendererPlugin(),
    createAchievementWebRendererPlugin(),
  ]
}
