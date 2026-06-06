import type { RendererPlugin } from '@quajs/render-core'
import type { CocosRendererPlugin } from '../types'
import type { InputCocosRendererPluginOptions } from './input'
import type { UiCocosRendererPluginOptions } from './ui'
import { createAchievementCocosRendererPlugin } from './achievement'
import { createAudioCocosRendererPlugin } from './audio'
import { createBackgroundCocosRendererPlugin } from './background'
import { createBacklogCocosRendererPlugin } from './backlog'
import { createCharacterCocosRendererPlugin } from './character'
import { createChoicesCocosRendererPlugin } from './choices'
import { createDialogueCocosRendererPlugin } from './dialogue'
import { createEffectsCocosRendererPlugin } from './effects'
import { createFontsCocosRendererPlugin } from './fonts'
import { createGalleryCocosRendererPlugin } from './gallery'
import { createInputCocosRendererPlugin } from './input'
import { createSavePreviewCocosRendererPlugin } from './save-preview'
import { createSceneCocosRendererPlugin } from './scene'
import { createSettingsCocosRendererPlugin } from './settings'
import { createSpriteCocosRendererPlugin } from './sprite'
import { createUiCocosRendererPlugin } from './ui'

export interface VisualNovelCocosRendererPresetOptions {
  input?: false | InputCocosRendererPluginOptions
  ui?: false | UiCocosRendererPluginOptions
}

export function createVisualNovelCocosRendererPlugins(
  options: VisualNovelCocosRendererPresetOptions = {},
): Array<CocosRendererPlugin | RendererPlugin> {
  return [
    ...(options.input === false ? [] : [createInputCocosRendererPlugin(options.input || {})]),
    createBackgroundCocosRendererPlugin(),
    createSpriteCocosRendererPlugin(),
    createCharacterCocosRendererPlugin(),
    createEffectsCocosRendererPlugin(),
    createFontsCocosRendererPlugin(),
    createDialogueCocosRendererPlugin(),
    createChoicesCocosRendererPlugin(),
    createAudioCocosRendererPlugin(),
    createSceneCocosRendererPlugin(),
    ...(options.ui === false ? [] : [createUiCocosRendererPlugin(createPresetUiOptions(options.ui))]),
    createSettingsCocosRendererPlugin(),
    createBacklogCocosRendererPlugin(),
    createGalleryCocosRendererPlugin(),
    createAchievementCocosRendererPlugin(),
    createSavePreviewCocosRendererPlugin(),
  ]
}

function createPresetUiOptions(options: UiCocosRendererPluginOptions | undefined): UiCocosRendererPluginOptions {
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
