import type { QuaSvelteRendererPlugin } from './core'
import { createBacklogWebRendererPlugin } from '@quajs/renderer-web/plugins/backlog'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/backlog'

export function createBacklogRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createBacklogWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/backlog',
  })
}

export const backlogRendererPlugin = createBacklogRendererPlugin()
