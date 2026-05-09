import type { QuaVueRendererPlugin } from '../core'
import { createAudioRendererPlugin } from '../audio'
import { createBackgroundRendererPlugin } from '../background'
import { createCharacterRendererPlugin } from '../character'
import { createChoicesRendererPlugin } from '../choices'
import { createDialogueRendererPlugin } from '../dialogue'
import { createEffectsRendererPlugin } from '../effects'
import { createUiRendererPlugin } from '../ui'

export function createVisualNovelRendererPlugins(): QuaVueRendererPlugin[] {
  return [
    createBackgroundRendererPlugin(),
    createCharacterRendererPlugin(),
    createEffectsRendererPlugin(),
    createDialogueRendererPlugin(),
    createChoicesRendererPlugin(),
    createAudioRendererPlugin(),
    createUiRendererPlugin(),
  ]
}
