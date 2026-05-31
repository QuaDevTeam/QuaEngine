import type { QuaReactRendererPlugin } from './core'
import { createGalleryWebRendererPlugin } from '@quajs/renderer-web/plugins/gallery'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/gallery'

export function createGalleryRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createGalleryWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/gallery',
  })
}

export const galleryRendererPlugin = createGalleryRendererPlugin()
