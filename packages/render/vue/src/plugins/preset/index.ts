import type { QuaVueRendererPlugin } from '../core'
import { createAudioRendererPlugin } from '../audio'
import { createBackgroundRendererPlugin } from '../background'
import { createBacklogRendererPlugin } from '../backlog'
import { createCharacterRendererPlugin } from '../character'
import { createChoicesRendererPlugin } from '../choices'
import { createGalleryRendererPlugin } from '../gallery'
import { createDialogueRendererPlugin } from '../dialogue'
import { createEffectsRendererPlugin } from '../effects'
import { createFontsRendererPlugin } from '../fonts'
import { createInputRendererPlugin, type InputVueRendererPluginOptions } from '../input'
import { createSceneRendererPlugin } from '../scene'
import { createSettingsRendererPlugin } from '../settings'
import { createSpriteRendererPlugin } from '../sprite'
import { createUiRendererPlugin } from '../ui'

export interface VisualNovelRendererPresetOptions {
  input?: false | InputVueRendererPluginOptions
}

export function createVisualNovelRendererPlugins(options: VisualNovelRendererPresetOptions = {}): QuaVueRendererPlugin[] {
  return [
    ...(options.input === false ? [] : [createInputRendererPlugin(options.input || {})]),
    createFontsRendererPlugin(),
    createBackgroundRendererPlugin(),
    createSpriteRendererPlugin(),
    createCharacterRendererPlugin(),
    createEffectsRendererPlugin(),
    createDialogueRendererPlugin(),
    createChoicesRendererPlugin(),
    createAudioRendererPlugin(),
    createSceneRendererPlugin(),
    createUiRendererPlugin(),
    createSettingsRendererPlugin(),
    createBacklogRendererPlugin(),
    createGalleryRendererPlugin(),
  ]
}
