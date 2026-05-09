import type { RendererPlugin } from '@quajs/render-core'
import type { Component } from 'vue'

export interface QuaVueRendererLayer {
  id: string
  component: Component
  order?: number
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
  return [...layers].sort((left, right) => {
    const order = (left.order ?? 0) - (right.order ?? 0)
    return order === 0 ? left.id.localeCompare(right.id) : order
  })
}
