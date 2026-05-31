import type { SettingsRendererPluginOptions } from '@quajs/renderer-web/plugins/settings'
import type { QuaSvelteRendererPlugin } from './core'
import { createSettingsWebRendererPlugin } from '@quajs/renderer-web/plugins/settings'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/settings'

export type SettingsSvelteRendererPluginOptions = SettingsRendererPluginOptions

export function createSettingsRendererPlugin(options: SettingsSvelteRendererPluginOptions = {}): QuaSvelteRendererPlugin {
  const plugin = createSettingsWebRendererPlugin(options)
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/settings',
  })
}

export const settingsRendererPlugin = createSettingsRendererPlugin()
