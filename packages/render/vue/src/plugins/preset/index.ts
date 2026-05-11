import type { QuaVueRendererPlugin } from '../core'
import { createAudioRendererPlugin } from '../audio'
import { createBackgroundRendererPlugin } from '../background'
import { createBacklogRendererPlugin } from '../backlog'
import { createCharacterRendererPlugin } from '../character'
import { createChoicesRendererPlugin } from '../choices'
import { createDialogueRendererPlugin } from '../dialogue'
import { createEffectsRendererPlugin } from '../effects'
import { createSpriteRendererPlugin } from '../sprite'
import { createUiRendererPlugin } from '../ui'

export function createVisualNovelRendererPlugins(): QuaVueRendererPlugin[] {
  return [
    createBackgroundRendererPlugin(),
    createSpriteRendererPlugin(),
    createCharacterRendererPlugin(),
    createEffectsRendererPlugin(),
    createDialogueRendererPlugin(),
    createChoicesRendererPlugin(),
    createAudioRendererPlugin(),
    createUiRendererPlugin(),
    createBacklogRendererPlugin(),
  ]
}
