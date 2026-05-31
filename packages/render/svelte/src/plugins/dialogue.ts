import type { QuaSvelteRendererPlugin } from './core'
import { createDialogueWebRendererPlugin } from '@quajs/renderer-web/plugins/dialogue'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/dialogue'

export function createDialogueRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createDialogueWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/dialogue',
  })
}

export const dialogueRendererPlugin = createDialogueRendererPlugin()
