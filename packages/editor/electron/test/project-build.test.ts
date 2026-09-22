import type { EditorBuildState } from '@quajs/editor-core'
import { writeFile } from 'node:fs/promises'
import { createEditorBuildSteps } from '@quajs/editor-core'
import { expect, it } from 'vitest'
import { ProjectBuild } from '../src/runtime/project-build.js'

it('returns a real build result and bounds streamed logs', async () => {
  const events: EditorBuildState[] = []
  const build = new ProjectBuild(state => events.push(state), async (command, args, root, operation) => {
    expect(command).toBe('node')
    expect(root).toBe('/project')
    expect(operation.env.NODE_OPTIONS).toBeUndefined()
    operation.report('x'.repeat(100000))
    for (const step of createEditorBuildSteps('native')) {
      if (step.id === 'notarize') {
        operation.reportEvent?.(`${JSON.stringify({ version: 1, step: step.id, status: 'skipped' })}\n`)
      }
      else {
        for (const status of ['running', 'completed'])
          operation.reportEvent?.(`${JSON.stringify({ version: 1, step: step.id, status })}\n`)
      }
    }
    await writeFile(args[args.indexOf('--result-file') + 1], JSON.stringify({ target: 'native', artifact: '/project/dist/Game.app', signing: 'adhoc', notarized: false }))
    return ''
  })
  await build.start('/project', 'native', { NODE_OPTIONS: '--inspect' })
  expect(build.busy).toBe(false)
  expect(events.at(-1)).toMatchObject({ phase: 'completed', artifact: '/project/dist/Game.app', signing: 'adhoc' })
  expect(build.snapshot()?.log.length).toBe(64000)
  expect(build.snapshot()?.steps.find(step => step.id === 'notarize')).toMatchObject({ phase: 'skipped', detail: '项目未启用公证' })
  expect(events[0].steps[0].phase).toBe('running')
  expect(events[0].steps[1].phase).toBe('pending')
  expect(build.snapshot()?.finishedAt).toBeGreaterThanOrEqual(build.snapshot()!.startedAt)
})

it('cancels the owned operation before reporting cancellation and allows retry', async () => {
  let stopped = false
  const build = new ProjectBuild(() => {}, async (_command, _args, _root, operation) => {
    await new Promise<void>((resolve) => {
      if (operation.signal.aborted)
        resolve()
      else operation.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    stopped = true
    operation.signal.throwIfAborted()
    return ''
  })
  const pending = build.start('/project', 'web', {})
  expect(() => build.start('/other', 'web', {})).toThrow('已有')
  await build.cancel()
  await pending
  expect(stopped).toBe(true)
  expect(build.snapshot()).toMatchObject({ phase: 'cancelled' })
  expect(build.snapshot()?.steps[0].phase).toBe('cancelled')
  expect(build.snapshot()?.steps[1].phase).toBe('pending')
  expect(build.busy).toBe(false)
})

it('attributes failure to the running stage without completing later stages', async () => {
  const build = new ProjectBuild(() => {}, async (_command, _args, _root, operation) => {
    operation.reportEvent?.('{"version":1,"step":"prepare","status":"completed"}\n{"version":1,"step":"compile","status":"running"}\n')
    operation.report('Compiling failed\n')
    throw new Error('compiler failed')
  })
  await build.start('/project', 'web', {})
  expect(build.snapshot()?.steps.map(step => step.phase)).toEqual(['completed', 'error', 'pending', 'pending'])
  expect(build.snapshot()?.message).toBe('构建游戏代码失败')
  const snapshot = build.snapshot()!
  snapshot.steps[0].phase = 'error'
  expect(build.snapshot()?.steps[0].phase).toBe('completed')
  await build.start('/retry', 'web', {})
  expect(build.snapshot()?.root).toBe('/retry')
  expect(build.snapshot()?.log.match(/compiler failed/gu)).toHaveLength(1)
})

it('does not infer successful steps from human logs or a result without progress', async () => {
  const build = new ProjectBuild(() => {}, async (_command, args, _root, operation) => {
    operation.report('Building Web (production)…\nApplication ready\n')
    await writeFile(args[args.indexOf('--result-file') + 1], JSON.stringify({ target: 'web', artifact: '/project/dist/site' }))
    return ''
  })
  await build.start('/project', 'web', {})
  expect(build.snapshot()).toMatchObject({ phase: 'error' })
  expect(build.snapshot()?.steps[1].phase).toBe('pending')
  expect(build.snapshot()?.artifact).toBeUndefined()
})
