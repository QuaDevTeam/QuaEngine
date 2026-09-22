import type { EditorProject } from '@quajs/editor-core'
import { parentPort } from 'node:worker_threads'
import { ProjectESLint } from './eslint.js'

let linter: ProjectESLint | undefined
let pending = Promise.resolve()
parentPort?.on('message', (request: { id: number, method: string, args: unknown[] }) => {
  pending = pending.catch(() => {}).then(async () => {
    try {
      let result: unknown
      if (request.method === 'configure')
        linter = new ProjectESLint((request.args[0] as EditorProject).root)
      else if (request.method === 'analyze' && linter)
        result = await linter.analyze(request.args[0] as string, request.args[1] as string)
      else
        throw new Error('Unknown ESLint request.')
      parentPort?.postMessage({ id: request.id, result })
    }
    catch (error) { parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }) }
  })
})
