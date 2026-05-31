import type { SettingsRendererPluginOptions } from '@quajs/renderer-web/plugins/settings'
import type { QuaReactRendererPlugin } from './core'
import { createSettingsWebRendererPlugin } from '@quajs/renderer-web/plugins/settings'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/settings'

export type SettingsReactRendererPluginOptions = SettingsRendererPluginOptions

export function createSettingsRendererPlugin(options: SettingsReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createSettingsWebRendererPlugin(options)
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/settings',
  })
}

export const settingsRendererPlugin = createSettingsRendererPlugin()
