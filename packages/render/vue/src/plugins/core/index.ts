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
  provides?: readonly string[]
  requires?: readonly string[]
}

export function defineVueRendererPlugin(plugin: QuaVueRendererPlugin): QuaVueRendererPlugin {
  return plugin
}

export function validateRendererDependencies(plugins: readonly QuaVueRendererPlugin[]): void {
  const providers = createCapabilityProviderMap(plugins)
  const missing: Array<{ plugin: string, capability: string }> = []

  for (const plugin of plugins) {
    for (const capability of plugin.requires || []) {
      if (!providers.has(capability)) {
        missing.push({ plugin: plugin.name, capability })
      }
    }
  }

  if (missing.length > 0) {
    throw new Error([
      'Missing Qua renderer plugin capabilities:',
      ...missing.map(item => `- ${item.plugin} requires ${item.capability}`),
    ].join('\n'))
  }
}

export function sortRendererPlugins(plugins: readonly QuaVueRendererPlugin[]): QuaVueRendererPlugin[] {
  validateRendererDependencies(plugins)

  const providers = createCapabilityProviderMap(plugins)
  const remaining = [...plugins]
  const ordered: QuaVueRendererPlugin[] = []
  const orderedNames = new Set<string>()

  while (remaining.length > 0) {
    let progressed = false

    for (let index = 0; index < remaining.length; index++) {
      const plugin = remaining[index]
      const ready = (plugin.requires || []).every((capability) => {
        const provider = providers.get(capability)
        return !provider || provider.name === plugin.name || orderedNames.has(provider.name)
      })

      if (!ready) {
        continue
      }

      ordered.push(plugin)
      orderedNames.add(plugin.name)
      remaining.splice(index, 1)
      progressed = true
      index -= 1
    }

    if (!progressed) {
      throw new Error(`Circular Qua renderer plugin capability dependency detected: ${remaining.map(plugin => plugin.name).join(', ')}`)
    }
  }

  return ordered
}

export function sortRendererLayers(layers: readonly QuaVueRendererLayer[]): QuaVueRendererLayer[] {
  return [...layers].sort((left, right) => {
    const order = (left.order ?? 0) - (right.order ?? 0)
    return order === 0 ? left.id.localeCompare(right.id) : order
  })
}

function createCapabilityProviderMap(plugins: readonly QuaVueRendererPlugin[]): Map<string, QuaVueRendererPlugin> {
  const providers = new Map<string, QuaVueRendererPlugin>()
  for (const plugin of plugins) {
    for (const capability of plugin.provides || []) {
      if (!providers.has(capability)) {
        providers.set(capability, plugin)
      }
    }
  }
  return providers
}
