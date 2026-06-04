import type { CocosRendererPlugin, CocosRendererPluginDefinition } from '../types'

export function defineCocosRendererPlugin(plugin: CocosRendererPluginDefinition): CocosRendererPlugin {
  return plugin as CocosRendererPlugin
}
