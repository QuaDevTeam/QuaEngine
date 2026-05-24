import type {
  QuaWebDomLayerContext,
  QuaWebDomRendererLayer,
  QuaWebDomRendererPlugin,
} from '@quajs/renderer-web/plugins/core'
import { sortRendererLayers } from '@quajs/renderer-web'
import { defineWebRendererPlugin } from '@quajs/renderer-web/plugins/core'

export type QuaReactDomLayerContext = QuaWebDomLayerContext
export type QuaReactRendererLayer = QuaWebDomRendererLayer
export type QuaReactRendererPlugin = QuaWebDomRendererPlugin

export function defineReactRendererPlugin(plugin: QuaReactRendererPlugin): QuaReactRendererPlugin {
  return defineWebRendererPlugin(plugin)
}

export { sortRendererLayers }
