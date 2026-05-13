import type { RendererPlugin } from '@quajs/render-core'
import type { StageRenderPlane } from '@quajs/renderer-web'
import type { Component } from 'vue'
import { sortRendererLayers as sortOrderedRendererLayers } from '@quajs/renderer-web'

export interface QuaVueRendererLayer {
  id: string
  component: Component
  order?: number
  plane?: StageRenderPlane
  slot?: string
  props?: Record<string, unknown>
}

export interface QuaVueRendererPlugin extends RendererPlugin {
  layers?: readonly QuaVueRendererLayer[]
}

export function defineVueRendererPlugin(plugin: QuaVueRendererPlugin): QuaVueRendererPlugin {
  return plugin
}

export function sortRendererLayers(layers: readonly QuaVueRendererLayer[]): QuaVueRendererLayer[] {
  return sortOrderedRendererLayers(layers)
}
