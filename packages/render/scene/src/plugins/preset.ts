import type { RendererPlugin } from '@quajs/render-core'
import type { SceneRendererPlugin } from '../types'
import type { CharacterSceneRendererPluginOptions } from './character'
import type { InputSceneRendererPluginOptions } from './input'
import type { UiSceneRendererPluginOptions } from './ui'
import { createAchievementSceneRendererPlugin } from './achievement'
import { createAudioSceneRendererPlugin } from './audio'
import { createBackgroundSceneRendererPlugin } from './background'
import { createBacklogSceneRendererPlugin } from './backlog'
import { createCharacterSceneRendererPlugin } from './character'
import { createChoicesSceneRendererPlugin } from './choices'
import { createDialogueSceneRendererPlugin } from './dialogue'
import { createEffectsSceneRendererPlugin } from './effects'
import { createFontsSceneRendererPlugin } from './fonts'
import { createGallerySceneRendererPlugin } from './gallery'
import { createInputSceneRendererPlugin } from './input'
import { createSavePreviewSceneRendererPlugin } from './save-preview'
import { createSceneSceneRendererPlugin } from './scene'
import { createSettingsSceneRendererPlugin } from './settings'
import { createSpriteSceneRendererPlugin } from './sprite'
import { createUiSceneRendererPlugin } from './ui'

export interface VisualNovelSceneRendererPresetOptions {
  input?: false | InputSceneRendererPluginOptions
  character?: CharacterSceneRendererPluginOptions
  ui?: false | UiSceneRendererPluginOptions
}

export function createVisualNovelSceneRendererPlugins(
  options: VisualNovelSceneRendererPresetOptions = {},
): Array<SceneRendererPlugin | RendererPlugin> {
  return [
    ...(options.input === false ? [] : [createInputSceneRendererPlugin(options.input || {})]),
    createBackgroundSceneRendererPlugin(),
    createSpriteSceneRendererPlugin(),
    createCharacterSceneRendererPlugin(options.character),
    createEffectsSceneRendererPlugin(),
    createFontsSceneRendererPlugin(),
    createDialogueSceneRendererPlugin(),
    createChoicesSceneRendererPlugin(),
    createAudioSceneRendererPlugin(),
    createSceneSceneRendererPlugin(),
    ...(options.ui === false ? [] : [createUiSceneRendererPlugin(createPresetUiOptions(options.ui))]),
    createSettingsSceneRendererPlugin(),
    createBacklogSceneRendererPlugin(),
    createGallerySceneRendererPlugin(),
    createAchievementSceneRendererPlugin(),
    createSavePreviewSceneRendererPlugin(),
  ]
}

function createPresetUiOptions(options: UiSceneRendererPluginOptions | undefined): UiSceneRendererPluginOptions {
  return {
    ...(options || {}),
    handledElementIds: mergeHandledElementIds(['settings'], options?.handledElementIds),
  }
}

function mergeHandledElementIds(
  defaults: readonly string[],
  configured: readonly string[] | undefined,
): string[] {
  return [...new Set([...defaults, ...(configured || [])])]
}
