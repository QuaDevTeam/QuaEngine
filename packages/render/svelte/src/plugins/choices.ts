import type { QuaSvelteRendererPlugin } from './core'
import { createChoicesWebRendererPlugin } from '@quajs/renderer-web/plugins/choices'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/choices'

export function createChoicesRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createChoicesWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/choices',
  })
}

export const choicesRendererPlugin = createChoicesRendererPlugin()
