import type { EditorProjectIndexer } from '@quajs/editor-core'
import type { AnimationCatalog } from '../contracts.js'
import { ANIMATION_EDITOR_ID } from '../contracts.js'
import { parseTimeline } from '../model/timeline.js'
import { indexAnimationScenes } from './scenes.js'

export const animationEditorIndexer: EditorProjectIndexer = {
  id: ANIMATION_EDITOR_ID,
  apiVersion: 1,
  async index(context): Promise<AnimationCatalog> {
    const catalog: AnimationCatalog = { animations: [], issues: [] }
    const files = context.entries.filter(
      entry =>
        entry.kind === 'document' && entry.path.endsWith('.animation.json'),
    )
    let bytes = 0
    for (const entry of files.slice(0, 128)) {
      try {
        if (entry.size > 512 * 1024 || bytes + entry.size > 8 * 1024 * 1024)
          throw new Error('动画索引达到单文件 512 KiB 或总量 8 MiB 上限。')
        const document = await context.readDocument(entry.path)
        bytes += new TextEncoder().encode(document.text).byteLength
        if (bytes > 8 * 1024 * 1024)
          throw new Error('动画索引达到总量 8 MiB 上限。')
        catalog.animations.push({
          path: entry.path,
          timeline: parseTimeline(document.text),
          edit: {
            root: context.root,
            path: entry.path,
            revision: document.revision,
            start: 0,
            end: document.text.length,
            expectedText: document.text,
          },
        })
      }
      catch (error) {
        catalog.issues.push(
          `${entry.path}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    if (files.length > 128)
      catalog.issues.push('动画索引最多读取 128 个文件。')
    await indexAnimationScenes(context, catalog)
    return catalog
  },
}
