import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { startProjectProcess } from '../src/preview-host/process.js'

describe.skipIf(process.platform === 'win32')('preview process ownership', () => {
  it('cleans split terminal controls before logs and preview failure diagnostics reach IPC', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-output-'))
    let output = ''
    const failed = vi.fn()
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { preview: 'node preview.mjs --fail' } }))
    await copyFile(new URL('./fixtures/process-output.mjs', import.meta.url), join(root, 'preview.mjs'))
    const child = await startProjectProcess({
      projectRoot: root,
      script: 'preview',
      target: 'native',
      sessionId: 'output-test',
      buildRevision: 'fixture',
      signal: new AbortController().signal,
      failed,
      log: (text) => { output += text },
    }, [])
    try {
      await expect.poll(() => failed.mock.calls.length, { timeout: 10000 }).toBe(1)
      expect(output).toContain('WARN stderr survives\n\ntransforming (12) 中文模块\nbuilt in 375ms\nproject link\n')
      expect(output).toContain('literal [2K and \\u001B[31m stay text\n')
      expect(output).not.toContain('\u001B')
      expect(output).not.toMatch(/\r|hidden window title|https:\/\/example.test/u)
      const failure = failed.mock.calls[0]![0] as Error
      expect(failure.message).toContain('ERROR actionable diagnostic')
      expect(failure.message).not.toContain('\u001B')
    }
    finally {
      await child.stop()
      await rm(root, { recursive: true, force: true })
    }
  }, 15000)

  it('cancels the complete process group, including descendants that ignore SIGTERM', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-editor-process-'))
    const abort = new AbortController()
    let output = ''
    const failed = vi.fn()
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { preview: 'node preview.mjs' } }))
    await writeFile(join(root, 'preview.mjs'), `
      import { spawn } from 'node:child_process'
      process.on('SIGTERM', () => {})
      const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'inherit' })
      console.log('CHILDREN:' + process.pid + ',' + child.pid)
      setInterval(() => {}, 1000)
    `)
    const child = await startProjectProcess({
      projectRoot: root,
      script: 'preview',
      target: 'web',
      sessionId: 'process-test',
      buildRevision: 'fixture',
      signal: abort.signal,
      failed,
      log: (text) => { output += text },
    }, [])
    try {
      await expect.poll(() => output, { timeout: 10000 }).toMatch(/CHILDREN:\d+,\d+/)
      const pids = output.match(/CHILDREN:(\d+),(\d+)/)!.slice(1).map(Number)
      abort.abort()
      await child.stop()
      await expect.poll(() => pids.every((pid) => {
        try {
          process.kill(pid, 0)
          return false
        }
        catch (error) {
          return (error as NodeJS.ErrnoException).code === 'ESRCH'
        }
      }), { timeout: 5000 }).toBe(true)
      expect(failed).not.toHaveBeenCalled()
    }
    finally {
      await child.stop()
      await rm(root, { recursive: true, force: true })
    }
  }, 20000)
})
