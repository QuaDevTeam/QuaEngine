import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'

const worker = new Worker(new URL('../dist/project-worker.js', import.meta.url))
const projectRoot = resolve(process.argv[2] || 'demo')
const start = performance.now()
let project
let checker
try {
  project = await new Promise((resolve, reject) => {
    worker.on('error', reject)
    worker.on('message', (reply) => {
      if (reply.error)
        reject(new Error(reply.error))
      if (reply.id === 1 && reply.result) {
        resolve(reply.result)
      }
    })
    worker.postMessage({ id: 1, method: 'open', args: [projectRoot] })
  })
  checker = new Worker(new URL('../dist/check-worker.js', import.meta.url), { workerData: project })
  const result = await new Promise((resolve, reject) => {
    checker.on('error', reject)
    checker.on('message', (reply) => {
      if (reply.check?.phase === 'complete' || reply.check?.phase === 'error')
        resolve(reply.check)
    })
    checker.on('exit', () => reject(new Error('Project check exited without a result')))
  })
  const diagnostics = [...project.diagnostics, ...result.diagnostics]
  for (const item of diagnostics) process.stdout.write(`${item.severity}: ${item.filePath || projectRoot}:${item.line || 1}:${item.column || 1} ${item.code} ${item.message}\n`)
  const errors = diagnostics.filter(item => item.severity === 'error').length
  process.stdout.write(`${result.completed}/${result.total} checks · ${errors} errors · ${diagnostics.length - errors} warnings/info · ${Math.round(performance.now() - start)} ms\n`)
  if (errors || result.phase === 'error')
    process.exitCode = 1
}
finally { await Promise.all([worker.terminate(), checker?.terminate()]) }
