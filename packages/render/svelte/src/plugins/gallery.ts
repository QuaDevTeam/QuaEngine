import type { QuaSvelteRendererPlugin } from './core'
import { createGalleryWebRendererPlugin } from '@quajs/renderer-web/plugins/gallery'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/gallery'

export function createGalleryRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createGalleryWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/gallery',
  })
}

export const galleryRendererPlugin = createGalleryRendererPlugin()
