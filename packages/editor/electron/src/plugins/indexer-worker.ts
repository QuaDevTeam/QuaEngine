import type {
  EditorFileEntry,
  EditorPluginIndexerDescriptor,
  EditorProjectIndexer,
} from '@quajs/editor-core'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serialize } from 'node:v8'
import { parentPort, workerData } from 'node:worker_threads'
import { parsePluginMetadata } from '@quajs/editor-core'
import { readProjectDocument } from '../project-service/documents.js'
import { packageFile, readPackageJson } from './installed.js'

const { root, entries, descriptor } = workerData as {
  root: string
  entries: EditorFileEntry[]
  descriptor: EditorPluginIndexerDescriptor
}
async function run(): Promise<void> {
  try {
    const manifest = await readPackageJson(join(descriptor.directory, 'package.json'))
    const metadata = parsePluginMetadata(descriptor.name, manifest)
    if (manifest.name !== descriptor.name || manifest.version !== descriptor.version || metadata?.id !== descriptor.id || !metadata.devtools?.indexer || await packageFile(descriptor.directory, metadata.devtools.indexer) !== descriptor.entry)
      throw new Error('插件版本或入口已改变，请重新启用。')
    const module = await import(pathToFileURL(descriptor.entry).href)
    const indexer
      = module[descriptor.export ?? 'editorIndexer']
        ?? (module.default as EditorProjectIndexer)
    if (
      !indexer
      || indexer.id !== descriptor.id
      || indexer.apiVersion !== 1
      || typeof indexer.index !== 'function'
    ) {
      throw new Error('插件索引入口与元数据不匹配。')
    }
    const paths = new Set(
      entries
        .filter(entry => entry.kind === 'document')
        .map(entry => entry.path),
    )
    const data = await indexer.index({
      root,
      entries,
      readDocument: async (path: string) => {
        if (!paths.has(path))
          throw new Error('只能读取已索引的项目源文件。')
        return readProjectDocument(root, path)
      },
    })
    if (serialize(data).byteLength > 4 * 1024 * 1024)
      throw new Error('插件索引结果超过 4 MiB 上限。')
    parentPort?.postMessage({ data })
  }
  catch (error) {
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
void run()
