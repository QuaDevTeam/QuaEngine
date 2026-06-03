import type { CharacterVueRendererPluginOptions } from '../character'
import type { QuaVueRendererPlugin } from '../core'
import type { InputVueRendererPluginOptions } from '../input'
import { createAchievementRendererPlugin } from '../achievement'
import { createAudioRendererPlugin } from '../audio'
import { createBackgroundRendererPlugin } from '../background'
import { createBacklogRendererPlugin } from '../backlog'
import { createCharacterRendererPlugin } from '../character'
import { createChoicesRendererPlugin } from '../choices'
import { createDialogueRendererPlugin } from '../dialogue'
import { createEffectsRendererPlugin } from '../effects'
import { createFontsRendererPlugin } from '../fonts'
import { createGalleryRendererPlugin } from '../gallery'
import { createInputRendererPlugin } from '../input'
import { createSceneRendererPlugin } from '../scene'
import { createSettingsRendererPlugin } from '../settings'
import { createSpriteRendererPlugin } from '../sprite'
import { createUiRendererPlugin } from '../ui'

export interface VisualNovelRendererPresetOptions {
  character?: false | CharacterVueRendererPluginOptions
  input?: false | InputVueRendererPluginOptions
}

export function createVisualNovelRendererPlugins(options: VisualNovelRendererPresetOptions = {}): QuaVueRendererPlugin[] {
  return [
    ...(options.input === false ? [] : [createInputRendererPlugin(options.input || {})]),
    createFontsRendererPlugin(),
    createBackgroundRendererPlugin(),
    createSpriteRendererPlugin(),
    ...(options.character === false ? [] : [createCharacterRendererPlugin(options.character || {})]),
    createEffectsRendererPlugin(),
    createDialogueRendererPlugin(),
    createChoicesRendererPlugin(),
    createAudioRendererPlugin(),
    createSceneRendererPlugin(),
    createUiRendererPlugin(),
    createSettingsRendererPlugin(),
    createBacklogRendererPlugin(),
    createGalleryRendererPlugin(),
    createAchievementRendererPlugin(),
  ]
}
