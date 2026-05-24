import type {
  QuaWebDomLayerContext,
  QuaWebDomRendererLayer,
  QuaWebDomRendererPlugin,
} from '@quajs/renderer-web/plugins/core'
import { sortRendererLayers } from '@quajs/renderer-web'
import { defineWebRendererPlugin } from '@quajs/renderer-web/plugins/core'

export type QuaSvelteDomLayerContext = QuaWebDomLayerContext
export type QuaSvelteRendererLayer = QuaWebDomRendererLayer
export type QuaSvelteRendererPlugin = QuaWebDomRendererPlugin

export function defineSvelteRendererPlugin(plugin: QuaSvelteRendererPlugin): QuaSvelteRendererPlugin {
  return defineWebRendererPlugin(plugin)
}

export { sortRendererLayers }
