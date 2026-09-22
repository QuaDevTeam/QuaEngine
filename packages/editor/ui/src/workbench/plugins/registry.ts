import type {
  EditorDevtoolsDescriptor,
  EditorPlugin,
} from '@quajs/editor-core'
import { animationEditorPlugin } from '@quajs/editor-animation'
import { characterEditorPlugin } from '@quajs/editor-character'
import { validateEditorPlugins } from '@quajs/editor-core'
import { novelWriterEditorPlugin } from '@quajs/editor-novel-writer'
import '@quajs/editor-character/styles.scss'
import '@quajs/editor-animation/styles.scss'

export const editorPlugins: readonly EditorPlugin[] = [characterEditorPlugin, animationEditorPlugin, novelWriterEditorPlugin]

/** Installed devtools are trusted code, enabled explicitly per project and version. */
export async function loadEditorPlugin(
  descriptor: EditorDevtoolsDescriptor,
): Promise<EditorPlugin> {
  const module = await import(/* @vite-ignore */ descriptor.url)
  const plugin: EditorPlugin
    = module[descriptor.export ?? 'editorPlugin'] ?? module.default
  if (
    !plugin
    || plugin.id !== descriptor.id
    || !Array.isArray(plugin.panels)
    || plugin.panels.length > 16
  ) {
    throw new Error(`${descriptor.name}: 无效的编辑器插件导出。`)
  }
  validateEditorPlugins([plugin])
  validateEditorPlugins(
    plugin.panels.map(panel => ({ id: panel.id, apiVersion: 1 })),
  )
  for (const panel of plugin.panels) {
    if (
      typeof panel.title !== 'string'
      || !panel.title.trim()
      || panel.title.length > 100
      || typeof panel.mount !== 'function'
    ) {
      throw new Error(`${descriptor.name}: 无效的面板贡献。`)
    }
  }
  return {
    ...plugin,
    panels: plugin.panels.map(panel => ({
      ...panel,
      async mount(host, context) {
        const style = descriptor.styleUrl
          ? document.createElement('link')
          : undefined
        if (style) {
          style.rel = 'stylesheet'
          style.href = descriptor.styleUrl!
          document.head.append(style)
        }
        try {
          const instance = await panel.mount(host, context)
          return {
            update: project => instance.update(project),
            setVisible: visible => instance.setVisible(visible),
            dispose() {
              try {
                instance.dispose()
              }
              finally {
                style?.remove()
              }
            },
          }
        }
        catch (error) {
          style?.remove()
          throw error
        }
      },
    })),
  }
}
