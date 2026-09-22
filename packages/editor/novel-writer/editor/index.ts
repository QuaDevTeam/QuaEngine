import type { EditorPlugin } from '@quajs/editor-core'
import { NovelWriterWorkspace } from './workspace.js'

/** Built-in desktop workspace contribution; its service starts at first activation. */
export const novelWriterEditorPlugin: EditorPlugin = {
  id: 'qua.novel-writer',
  apiVersion: 1,
  panels: [],
  workspace: { id: 'novel-writer', title: 'Novel Writer', mount: (bridge, changed, icon) => new NovelWriterWorkspace(bridge, changed, icon) },
}
