import type { PreviewCommand, PreviewCommandResult, PreviewHandle, PreviewStart, PreviewState } from '@quajs/editor-core'
import type { ProjectClient } from '../src/project-service/client.js'
import { expect, it, vi } from 'vitest'
import { PreviewWorkbench } from '../src/preview-host/workbench.js'

function fixture(native = false) {
  let lines = ['first', 'second', 'third']
  let invalid = false
  let position = { path: 'story.qs', stepIndex: 2, message: 'ok' }
  const reload = vi.fn(async () => {})
  const stop = vi.fn(async () => {})
  const command = vi.fn(async (command: PreviewCommand): Promise<PreviewCommandResult> => {
    if (command.action === 'seek')
      position = { path: command.path, stepIndex: command.stepIndex, message: 'ok' }
    return position
  })
  const client = { request: async (method: string) => method === 'read'
    ? { path: '/project/story.qs', text: lines.join('\n') }
    : { diagnostics: invalid ? [{ severity: 'error', message: 'syntax failure', line: 2 }] : [], previewSteps: lines.map((_, index) => ({ index: index * 2, line: index + 1, endLine: index + 1 })) } } as unknown as ProjectClient
  const states: PreviewState[] = []
  let id = 0
  const start = vi.fn(async (_request: PreviewStart): Promise<PreviewHandle> => ({ command, stop, ...native ? {} : { reload } }))
  const workbench = new PreviewWorkbench(client, { createId: () => String(++id), loadDriver: async () => ({ start }), changed: state => states.push(state), log: () => {} })
  return { workbench, command, reload, stop, start, states, edit: (next: string[], error = false) => {
    lines = next
    invalid = error
  } }
}

it('uses compiler indices, preserves edited position, resets deletion and recovers from static errors', async () => {
  const f = fixture()
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  await f.workbench.command('1', { action: 'seek', path: 'story.qs', stepIndex: 2 })
  f.edit(['first', 'edited second', 'third'])
  await f.workbench.reload()
  expect(f.command).toHaveBeenLastCalledWith({ action: 'seek', path: 'story.qs', stepIndex: 2 })
  f.edit(['first', 'third'])
  await f.workbench.reload()
  expect(f.command).toHaveBeenLastCalledWith({ action: 'seek', path: 'story.qs', stepIndex: 0 })
  expect(f.workbench.getSnapshot().message).toContain('起点')
  const reloads = f.reload.mock.calls.length
  f.edit(['first', 'third'], true)
  await f.workbench.reload()
  expect(f.reload).toHaveBeenCalledTimes(reloads)
  expect(f.workbench.getSnapshot().renderError).toContain('syntax failure')
  f.edit(['first', 'third'])
  await f.workbench.reload()
  expect(f.workbench.getSnapshot().renderError).toBeUndefined()
  await f.workbench.stop()
})

it('samples during playback commands and keeps source position across debug commands', async () => {
  const f = fixture()
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  await f.workbench.command('1', { action: 'seek', path: 'story.qs', stepIndex: 2 })
  let finish!: (result: PreviewCommandResult) => void
  f.command.mockImplementationOnce(() => new Promise((resolve) => {
    finish = resolve
  }))
  const pending = f.workbench.command('1', { action: 'step' })
  f.command.mockResolvedValueOnce({ message: 'sample' })
  await expect(f.workbench.command('1', { action: 'debug', request: { kind: 'read', after: 0 } })).resolves.toEqual({ message: 'sample' })
  finish({ path: 'story.qs', stepIndex: 2, message: 'step' })
  await pending
  f.command.mockResolvedValueOnce({ message: 'pick' })
  await f.workbench.command('1', { action: 'debug', request: { kind: 'pick', enabled: true } })
  // A temporarily unavailable status response still preserves the last known QS point.
  f.command.mockRejectedValueOnce(new Error('reload in progress'))
  f.edit(['first', 'edited second', 'third'])
  await f.workbench.reload()
  expect(f.command).toHaveBeenLastCalledWith({ action: 'seek', path: 'story.qs', stepIndex: 2 })
  await f.workbench.stop()
})

it('replaces Native once and restores through the new engine command channel', async () => {
  const f = fixture(true)
  await f.workbench.start({ target: 'native', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  await f.workbench.command('1', { action: 'seek', path: 'story.qs', stepIndex: 4 })
  f.edit(['inserted', 'first', 'second', 'third'])
  await f.workbench.reload()
  expect(f.start).toHaveBeenCalledTimes(2)
  expect(f.stop).toHaveBeenCalledTimes(1)
  expect(f.workbench.getSnapshot().identity?.sessionId).toBe('2')
  expect(f.command).toHaveBeenLastCalledWith({ action: 'seek', path: 'story.qs', stepIndex: 6 })
  await f.workbench.stop()
})

it('does not restore or publish an obsolete reload after stop', async () => {
  const f = fixture()
  let finish!: () => void
  f.reload.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finish = resolve
  }))
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  await f.workbench.command('1', { action: 'seek', path: 'story.qs', stepIndex: 2 })
  const loading = f.workbench.reload()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await f.workbench.stop()
  finish()
  await loading
  expect(f.workbench.getSnapshot()).toEqual({ phase: 'idle', muted: false })
})

it('keeps runtime errors received during reload and clears them on a successful retry', async () => {
  const f = fixture()
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  f.reload.mockImplementationOnce(async () => {
    f.start.mock.calls[0][0].issue?.('render failed')
  })
  await f.workbench.reload()
  expect(f.workbench.getSnapshot().renderError).toBe('render failed')
  expect(f.workbench.getSnapshot().reloading).toBe(false)
  await f.workbench.reload()
  expect(f.workbench.getSnapshot().renderError).toBeUndefined()
  await f.workbench.stop()
})

it('runs a queued reload for a new session after an old reload finishes', async () => {
  const f = fixture()
  let finish!: () => void
  f.reload.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finish = resolve
  }))
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'a' })
  const old = f.workbench.reload()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await f.workbench.start({ target: 'web', projectRoot: '/project', script: 'dev', buildRevision: 'b' })
  void f.workbench.reload()
  finish()
  await old
  await vi.waitFor(() => expect(f.reload).toHaveBeenCalledTimes(2))
  expect(f.workbench.getSnapshot().identity?.sessionId).toBe('2')
  await f.workbench.stop()
})
