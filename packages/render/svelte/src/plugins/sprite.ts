import type { RendererPlugin } from '@quajs/render-core'
import { createSpriteWebRendererPlugin } from '@quajs/renderer-web/plugins/sprite'

export * from '@quajs/renderer-web/plugins/sprite'

export function createSpriteRendererPlugin(): RendererPlugin {
  const plugin = createSpriteWebRendererPlugin()
  return {
    ...plugin,
    name: '@quajs/renderer-svelte/sprite',
  }
}

export const spriteRendererPlugin = createSpriteRendererPlugin()
