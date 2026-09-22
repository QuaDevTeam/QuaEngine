import type { EditorTerminalEvent } from '@quajs/editor-core'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../src/terminal/service.js'

const services: TerminalService[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.dispose()))
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  vi.unstubAllEnvs()
})
async function fixture(autoAck = true) {
  vi.stubEnv('SHELL', '/bin/sh')
  const root = await mkdtemp(join(tmpdir(), 'qua-terminal-test-'))
  directories.push(root)
  const events: EditorTerminalEvent[] = []
  const service = new TerminalService((event) => {
    events.push(event)
    if (autoAck && event.type === 'data')
      service.acknowledge(event.id, event.sequence)
  })
  services.push(service)
  const session = service.create(root, 80, 24)
  return { service, session, events, root, output: () => events.filter(event => event.type === 'data').map(event => event.data).join('') }
}
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    if (await check())
      return
    await delay(20)
  }
  throw new Error('Terminal condition timed out')
}
describe.skipIf(process.platform === 'win32')('real PTY host', () => {
  it('runs an interactive TTY at project cwd, resizes, preserves ANSI/Unicode and drains final output before exit', async () => {
    const f = await fixture()
    f.service.acknowledge(f.session.id, 0)
    f.service.resize(f.session.id, 102, 31)
    f.service.write(f.session.id, 'stty -echo; pwd; test -t 0 && printf "TTY_OK\\n"; stty size; printf "\\033[32m你好 terminal\\033[0m\\n"; exit 7\r')
    await until(() => f.events.some(event => event.type === 'exit'))
    expect(f.output()).toContain(f.root)
    expect(f.output()).toContain('TTY_OK')
    expect(f.output()).toContain('31 102')
    expect(f.output()).toContain('\x1B[32m你好 terminal\x1B[0m')
    expect(f.events.at(-1)).toEqual({ type: 'exit', id: f.session.id, code: 7 })
  })

  it('backpressures high output until exact acknowledgments and does not lose the tail', async () => {
    const f = await fixture(false)
    f.service.write(f.session.id, 'stty -echo; i=0; while [ $i -lt 12000 ]; do printf "abcdefgh0123456789\\n"; i=$((i+1)); done; printf "FLOW_END\\n"\r')
    await delay(50)
    expect(f.events).toHaveLength(0)
    f.service.acknowledge(f.session.id, 0)
    await until(() => f.events.length > 0)
    await delay(120)
    expect(f.events).toHaveLength(1)
    f.service.acknowledge(f.session.id, 9999)
    await delay(60)
    expect(f.events).toHaveLength(1)
    let consumed = 0
    await until(() => {
      const event = f.events[consumed]
      if (event?.type === 'data') {
        expect(event.data.length).toBeLessThanOrEqual(32768)
        f.service.acknowledge(f.session.id, event.sequence)
        consumed++
      }
      return f.output().includes('\r\nFLOW_END\r\n')
    })
    expect(f.output().split('abcdefgh0123456789\r\n').length - 1).toBe(12000)
  })

  it('interrupts foreground jobs and removes separately grouped background children on close', async () => {
    const f = await fixture()
    f.service.acknowledge(f.session.id, 0)
    f.service.write(f.session.id, 'stty -echo; sleep 120 & echo $! > child.pid; sleep 120\r')
    await until(async () => Boolean(await readFile(join(f.root, 'child.pid'), 'utf8').catch(() => '')))
    const child = Number(await readFile(join(f.root, 'child.pid'), 'utf8'))
    f.service.write(f.session.id, '\x03')
    f.service.write(f.session.id, 'printf "INTERRUPT_OK\\n"\r')
    await until(() => f.output().includes('INTERRUPT_OK'))
    await f.service.close(f.session.id)
    await until(() => {
      try {
        process.kill(child, 0)
      }
      catch { return true }
      return false
    })
    expect(() => process.kill(f.session.pid, 0)).toThrow()
    await f.service.close(f.session.id)
  })

  it('bounds sessions, input and dimensions and rejects new sessions after disposal', async () => {
    const f = await fixture()
    expect(() => f.service.resize(f.session.id, 10000, 2)).toThrow()
    expect(() => f.service.write(f.session.id, 'x'.repeat(32769))).toThrow()
    for (let index = 0; index < 5; index++)
      f.service.create(f.root, 80, 24)
    expect(() => f.service.create(f.root, 80, 24)).toThrow('6')
    await f.service.dispose()
    expect(() => f.service.create(f.root, 80, 24)).toThrow()
  })
})
