import type { CharacterWebRendererPluginOptions } from '@quajs/renderer-web/plugins/character'
import type { QuaSvelteRendererPlugin } from './core'
import { createCharacterWebRendererPlugin } from '@quajs/renderer-web/plugins/character'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/character'

export type CharacterSvelteRendererPluginOptions = CharacterWebRendererPluginOptions

export function createCharacterRendererPlugin(options: CharacterSvelteRendererPluginOptions = {}): QuaSvelteRendererPlugin {
  const plugin = createCharacterWebRendererPlugin(options)
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/character',
  })
}

export const characterRendererPlugin = createCharacterRendererPlugin()
