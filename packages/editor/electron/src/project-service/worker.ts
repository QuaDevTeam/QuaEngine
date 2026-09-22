import type { EditorProject } from '@quajs/editor-core'
import type { ProjectRequestMethod } from './protocol.js'
import { parentPort } from 'node:worker_threads'
import { ProjectService } from './project.js'
import { ProjectWatcher } from './watcher.js'

const service = new ProjectService()
let pending = Promise.resolve()
let watcher: ProjectWatcher | undefined
let generation = 0
let refreshQueued = false
let changedPaths = new Set<string>()
function enqueue(action: () => Promise<void>): void {
  pending = pending.catch(() => {}).then(action)
}
function updateWatchers(project: EditorProject): EditorProject {
  const failures = watcher?.update(service.watchDirectories) ?? []
  if (failures.length)
    project.diagnostics.push({ code: 'EDITOR_WATCH_FAILED', severity: 'warning', message: `部分目录无法监听，可使用刷新按钮更新：${failures.slice(0, 5).join(', ')}` })
  return project
}
function scheduleRefresh(paths: string[], requestedGeneration: number): void {
  if (requestedGeneration !== generation)
    return
  for (const path of paths)
    changedPaths.add(path)
  if (changedPaths.size > 256)
    changedPaths = new Set([''])
  if (refreshQueued)
    return
  refreshQueued = true
  enqueue(async () => {
    if (requestedGeneration !== generation)
      return
    const paths = [...changedPaths]
    changedPaths.clear()
    refreshQueued = false
    const project = updateWatchers(await service.refresh())
    parentPort?.postMessage({ change: { project, paths } })
  })
}
parentPort?.on('message', (request: { id: number, method: ProjectRequestMethod, args: unknown[] }) => {
  enqueue(async () => {
    try {
      const allowed = ['writingContext', 'setPlugins', 'open', 'current', 'refresh', 'save', 'thumbnail', 'imageMetadata', 'importAssets', 'fileOperation', 'mutationPath'] as const
      const selected = allowed.find(method => method === request.method)
      if (!selected)
        throw new Error('Unknown project request.')
      const method = service[selected] as (...args: unknown[]) => unknown
      const result = await method.apply(service, request.args)
      if (request.method === 'open') {
        watcher?.close()
        const currentGeneration = ++generation
        changedPaths.clear()
        refreshQueued = false
        watcher = new ProjectWatcher((result as EditorProject).root, paths => scheduleRefresh(paths, currentGeneration))
        updateWatchers(result as EditorProject)
      }
      if (request.method === 'refresh') {
        updateWatchers(result as EditorProject)
        parentPort?.postMessage({ change: { project: result, paths: [''] } })
      }
      parentPort?.postMessage({ id: request.id, result })
    }
    catch (error) {
      parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
    }
  })
})
parentPort?.on('close', () => watcher?.close())
