import type { CharacterWebRendererPluginOptions } from '@quajs/renderer-web/plugins/character'
import type { QuaReactRendererPlugin } from './core'
import { createCharacterWebRendererPlugin } from '@quajs/renderer-web/plugins/character'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/character'

export type CharacterReactRendererPluginOptions = CharacterWebRendererPluginOptions

export function createCharacterRendererPlugin(options: CharacterReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createCharacterWebRendererPlugin(options)
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/character',
  })
}

export const characterRendererPlugin = createCharacterRendererPlugin()
