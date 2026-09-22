import type {
  EditorPluginData,
  EditorPluginIndexContext,
  EditorPluginIndexerDescriptor,
} from '@quajs/editor-core'
import { Worker } from 'node:worker_threads'
import { animationEditorIndexer } from '@quajs/editor-animation/indexer'
import { characterEditorIndexer } from '@quajs/editor-character/indexer'
import { indexEditorPlugins } from '@quajs/editor-core'

export async function inspectEditorPlugins(
  context: EditorPluginIndexContext,
  descriptors: EditorPluginIndexerDescriptor[] = [],
) {
  const result = await indexEditorPlugins([characterEditorIndexer, animationEditorIndexer], context)
  for (const descriptor of descriptors) {
    if (Object.hasOwn(result, descriptor.id))
      continue
    result[descriptor.id] = await new Promise<EditorPluginData>((resolve) => {
      const worker = new Worker(
        new URL('./plugin-indexer-worker.js', import.meta.url),
        {
          workerData: {
            descriptor,
            root: context.root,
            entries: context.entries,
          },
          resourceLimits: { maxOldGenerationSizeMb: 128 },
        },
      )
      let settled = false
      let timer: ReturnType<typeof setTimeout>
      const finish = (value: EditorPluginData) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        void worker.terminate()
        resolve(value)
      }
      timer = setTimeout(finish, 10000, { error: '插件索引超过 10 秒预算。' })
      worker.once('message', finish)
      worker.once('error', error =>
        finish({
          error: error instanceof Error ? error.message : String(error),
        }))
      worker.once('exit', () => finish({ error: '插件索引进程已退出。' }))
    })
  }
  return result
}
