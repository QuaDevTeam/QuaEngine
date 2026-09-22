import type { EditorPlugin } from '@quajs/editor-core'
import type { AnimationCatalog } from './contracts.js'
import { ANIMATION_EDITOR_ID } from './contracts.js'

export { ANIMATION_EDITOR_ID } from './contracts.js'
export const animationEditorPlugin: EditorPlugin = {
  id: ANIMATION_EDITOR_ID,
  apiVersion: 1,
  panels: [
    {
      id: 'animation',
      title: '动画',
      acceptsSource: (project, source) => Boolean((project.plugins?.[ANIMATION_EDITOR_ID]?.data as AnimationCatalog | undefined)?.animations.some(record => record.path === source.path)),
      mount: async (host, context) => {
        const { AnimationEditor } = await import('./editor/controller.js')
        return new AnimationEditor(host, context)
      },
    },
  ],
}
