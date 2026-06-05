import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererPlugin } from '@quajs/renderer-web/plugins/core'
import type { CharacterSvelteRendererPluginOptions } from './character'
import type { InputSvelteRendererPluginOptions } from './input'
import { createAchievementRendererPlugin } from './achievement'
import { createAudioRendererPlugin } from './audio'
import { createBackgroundRendererPlugin } from './background'
import { createBacklogRendererPlugin } from './backlog'
import { createCharacterRendererPlugin } from './character'
import { createChoicesRendererPlugin } from './choices'
import { createDialogueRendererPlugin } from './dialogue'
import { createEffectsRendererPlugin } from './effects'
import { createFontsRendererPlugin } from './fonts'
import { createGalleryRendererPlugin } from './gallery'
import { createInputRendererPlugin } from './input'
import { createSceneRendererPlugin } from './scene'
import { createSettingsRendererPlugin } from './settings'
import { createSpriteCharacterRenderer, createSpriteRendererPlugin } from './sprite'
import { createUiRendererPlugin } from './ui'

export interface VisualNovelSvelteRendererPresetOptions {
  character?: false | Omit<CharacterSvelteRendererPluginOptions, 'renderSprite'>
  input?: false | InputSvelteRendererPluginOptions
}

export function createVisualNovelRendererPlugins(
  options: VisualNovelSvelteRendererPresetOptions = {},
): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  const renderSprite = createSpriteCharacterRenderer()
  return [
    ...(options.input === false ? [] : [createInputRendererPlugin(options.input || {})]),
    createFontsRendererPlugin(),
    createBackgroundRendererPlugin(),
    createSpriteRendererPlugin(),
    ...(options.character === false ? [] : [createCharacterRendererPlugin({ renderSprite, ...(options.character || {}) })]),
    createEffectsRendererPlugin(),
    createDialogueRendererPlugin(),
    createChoicesRendererPlugin(),
    createAudioRendererPlugin(),
    createSceneRendererPlugin(),
    createUiRendererPlugin({ handledElementIds: ['settings'] }),
    createSettingsRendererPlugin(),
    createBacklogRendererPlugin(),
    createGalleryRendererPlugin(),
    createAchievementRendererPlugin(),
  ]
}
