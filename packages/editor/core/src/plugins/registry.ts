import type { EditorPluginData, EditorPluginIndexContext, EditorProjectIndexer } from './contracts.js'
import { EDITOR_PLUGIN_API_VERSION } from './contracts.js'

export function validateEditorPlugins(plugins: readonly { id: string, apiVersion: number }[]): void {
  const ids = new Set<string>()
  for (const plugin of plugins) {
    if (!/^[a-z][a-z0-9.-]{0,95}$/.test(plugin.id) || ids.has(plugin.id))
      throw new Error(`Invalid or duplicate editor plugin id: ${plugin.id}`)
    if (plugin.apiVersion !== EDITOR_PLUGIN_API_VERSION)
      throw new Error(`Unsupported editor plugin API: ${plugin.id}`)
    ids.add(plugin.id)
  }
}

export async function indexEditorPlugins(plugins: readonly EditorProjectIndexer[], context: EditorPluginIndexContext): Promise<Record<string, EditorPluginData>> {
  validateEditorPlugins(plugins)
  const result: Record<string, EditorPluginData> = Object.create(null)
  for (const plugin of plugins) {
    try {
      result[plugin.id] = { data: structuredClone(await plugin.index(context)) }
    }
    catch (error) {
      result[plugin.id] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
  return result
}
