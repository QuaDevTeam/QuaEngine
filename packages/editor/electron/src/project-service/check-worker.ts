import type { EditorProject } from '@quajs/editor-core'
import { parentPort, workerData } from 'node:worker_threads'
import { ProjectService } from './project.js'

// A disposable worker makes even synchronous TypeScript checks cancellable.
const project = workerData as EditorProject
const service = new ProjectService()
service.configure(project)
try {
  for await (const check of service.checkProject(project.root)) parentPort?.postMessage({ check })
}
catch (error) {
  parentPort?.postMessage({ check: { root: project.root, phase: 'error', completed: 0, total: 0, diagnostics: [{ code: 'EDITOR_PROJECT_CHECK', severity: 'error', message: String(error) }] } })
}
finally { parentPort?.close() }
