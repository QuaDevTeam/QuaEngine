import type { QuaSvelteRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export function createUiRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createUiWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()
