import type { QuaReactRendererPlugin } from './core'
import { createDialogueWebRendererPlugin } from '@quajs/renderer-web/plugins/dialogue'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/dialogue'

export function createDialogueRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createDialogueWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/dialogue',
  })
}

export const dialogueRendererPlugin = createDialogueRendererPlugin()
