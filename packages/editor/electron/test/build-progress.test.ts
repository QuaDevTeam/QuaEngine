import type { QuaProductionBuildProgress } from '@quajs/quack/project'
import { expect, it } from 'vitest'
import { BuildProgressDecoder } from '../src/runtime/build-progress.js'
import { runTool } from '../src/runtime/process.js'

it('handles every split boundary and rejects oversized, invalid and unknown events', () => {
  const event = { version: 1, step: 'bundle', status: 'running', detail: '故事资源', completed: 1, total: 3 }
  const line = `${JSON.stringify(event)}\n`
  for (let split = 0; split <= line.length; split++) {
    const received: QuaProductionBuildProgress[] = []
    const decoder = new BuildProgressDecoder(new Set(['bundle']), value => received.push(value))
    decoder.append('x'.repeat(18000))
    decoder.append('\nnull\n{"version":1,"step":"unknown","status":"running"}\n')
    decoder.append(`${JSON.stringify({ ...event, completed: 4 })}\n`)
    decoder.append(`${JSON.stringify({ ...event, status: 'error' })}\n`)
    decoder.append(line.slice(0, split))
    decoder.append(line.slice(split))
    expect(received).toEqual([event])
  }
})

it('receives stage events through a real child fd separately from large log chunks', async () => {
  const received: QuaProductionBuildProgress[] = []
  const decoder = new BuildProgressDecoder(new Set(['compile']), event => received.push(event))
  const source = 'const fs = require("node:fs"); process.stdout.write("x".repeat(100000)); fs.writeSync(3, JSON.stringify({version:1,step:"compile",status:"running"}) + "\\n"); fs.writeSync(3, JSON.stringify({version:1,step:"compile",status:"completed"}) + "\\n");'
  let log = ''
  await runTool(process.execPath, ['-e', source], process.cwd(), {
    signal: new AbortController().signal,
    env: process.env,
    report: (text) => { log += text },
    reportEvent: chunk => decoder.append(chunk),
  })
  expect(received.map(event => event.status)).toEqual(['running', 'completed'])
  expect(log).not.toContain('"step"')
})
