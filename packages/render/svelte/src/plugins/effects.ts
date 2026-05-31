import type { QuaSvelteRendererPlugin } from './core'
import { createEffectsWebRendererPlugin } from '@quajs/renderer-web/plugins/effects'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/effects'

export function createEffectsRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createEffectsWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/effects',
  })
}

export const effectsRendererPlugin = createEffectsRendererPlugin()
