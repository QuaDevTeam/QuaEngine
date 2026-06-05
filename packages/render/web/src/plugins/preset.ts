import type { RendererPlugin } from '@quajs/render-core'
import type { CharacterWebRendererPluginOptions } from './character'
import type { QuaWebDomRendererPlugin } from './core'
import type { InputWebRendererPluginOptions } from './input'
import type { PlatformGuardWebRendererPluginOptions } from './platform-guard'
import type { PwaWebRendererPluginOptions } from './pwa'
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
import { createPlatformGuardWebRendererPlugin } from './platform-guard'
import { createPwaWebRendererPlugin } from './pwa'
import { createSceneWebRendererPlugin } from './scene'
import { createSettingsWebRendererPlugin } from './settings'
import { createSpriteCharacterRenderer, createSpriteWebRendererPlugin } from './sprite'
import { createUiWebRendererPlugin } from './ui'

export interface VisualNovelWebRendererPresetOptions {
  character?: false | Omit<CharacterWebRendererPluginOptions, 'renderSprite'>
  input?: false | InputWebRendererPluginOptions
  platformGuard?: false | PlatformGuardWebRendererPluginOptions
  pwa?: false | PwaWebRendererPluginOptions
}

export function createVisualNovelWebRendererPlugins(options: VisualNovelWebRendererPresetOptions = {}): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  const renderSprite = createSpriteCharacterRenderer()
  return [
    ...(options.input === false ? [] : [createInputWebRendererPlugin(options.input || {})]),
    ...(options.platformGuard === false || !options.platformGuard ? [] : [createPlatformGuardWebRendererPlugin(options.platformGuard)]),
    ...(options.pwa === false || !options.pwa ? [] : [createPwaWebRendererPlugin(options.pwa)]),
    createFontsWebRendererPlugin(),
    createBackgroundWebRendererPlugin(),
    createSpriteWebRendererPlugin(),
    ...(options.character === false ? [] : [createCharacterWebRendererPlugin({ renderSprite, ...(options.character || {}) })]),
    createEffectsWebRendererPlugin(),
    createDialogueWebRendererPlugin(),
    createChoicesWebRendererPlugin(),
    createAudioWebRendererPlugin(),
    createSceneWebRendererPlugin(),
    createUiWebRendererPlugin({ handledElementIds: ['settings'] }),
    createSettingsWebRendererPlugin(),
    createBacklogWebRendererPlugin(),
    createGalleryWebRendererPlugin(),
    createAchievementWebRendererPlugin(),
  ]
}
