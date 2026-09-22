import { parentPort } from 'node:worker_threads'
import { ProjectService } from './project.js'

const service = new ProjectService()
let pending = Promise.resolve()
parentPort?.on('message', (request: { id: number, method: string, args: unknown[] }) => {
  pending = pending.catch(() => {}).then(async () => {
    try {
      const allowed = ['configure', 'syncDocuments', 'analyze', 'complete', 'hover', 'signature', 'define', 'format'] as const
      const method = allowed.find(method => method === request.method)
      if (!method)
        throw new Error('Unknown language request.')
      const action = service[method] as (...args: unknown[]) => unknown
      const result = await action.apply(service, request.args)
      parentPort?.postMessage({ id: request.id, result })
    }
    catch (error) { parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }) }
  })
})
