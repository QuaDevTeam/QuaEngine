import type { QuaSvelteRendererPlugin } from './core'
import { createBackgroundWebRendererPlugin } from '@quajs/renderer-web/plugins/background'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/background'

export function createBackgroundRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createBackgroundWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/background',
  })
}

export const backgroundRendererPlugin = createBackgroundRendererPlugin()
