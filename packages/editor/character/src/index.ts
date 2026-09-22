import type { EditorPlugin } from '@quajs/editor-core'
import type { CharacterCatalog } from './contracts.js'
import { CHARACTER_EDITOR_ID } from './contracts.js'
import { characterForSource } from './model/source.js'

export { CHARACTER_EDITOR_ID } from './contracts.js'
export type * from './contracts.js'

export const characterEditorPlugin: EditorPlugin = {
  id: CHARACTER_EDITOR_ID,
  apiVersion: 1,
  panels: [
    {
      id: 'characters',
      title: '角色浏览器',
      acceptsSource: (project, source) => Boolean(characterForSource(project.plugins?.[CHARACTER_EDITOR_ID]?.data as CharacterCatalog | undefined, source)),
      mount: async (host, context) => {
        const { CharacterBrowser } = await import('./editor/controller.js')
        return new CharacterBrowser(host, context)
      },
    },
  ],
}
