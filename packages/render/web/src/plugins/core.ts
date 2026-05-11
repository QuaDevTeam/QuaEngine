import type { QuaWebDomRendererLayer, QuaWebDomRendererPlugin } from '../dom'

export type {
  QuaWebDomLayerContext,
  QuaWebDomRendererLayer,
  QuaWebDomRendererOptions,
  QuaWebDomRendererPlugin,
} from '../dom'

export function defineWebRendererPlugin(plugin: QuaWebDomRendererPlugin): QuaWebDomRendererPlugin {
  return plugin
}

export type WebRendererLayerRender = QuaWebDomRendererLayer['render']
