import type { SceneRendererPlugin, SceneRendererPluginDefinition } from '../types'

export function defineSceneRendererPlugin(plugin: SceneRendererPluginDefinition): SceneRendererPlugin {
  return plugin as SceneRendererPlugin
}
