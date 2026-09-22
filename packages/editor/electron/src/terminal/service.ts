import type { EditorTerminalEvent, EditorTerminalSession } from '@quajs/editor-core'
import type { IPty } from 'node-pty'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { userInfo } from 'node:os'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node-pty'

const exec = promisify(execFile)
const CHUNK = 32 * 1024
const HIGH_WATER = 64 * 1024
interface Session {
  info: EditorTerminalSession
  pty: IPty
  pending: string
  sequence: number
  awaiting: boolean
  paused: boolean
  exit?: number
  exitSent?: boolean
  timer?: ReturnType<typeof setTimeout>
}

/** Runs in a dedicated utility process. One acknowledged output chunk per PTY. */
export class TerminalService {
  private readonly sessions = new Map<string, Session>()
  private disposed = false

  constructor(private readonly emit: (event: EditorTerminalEvent) => void) {}

  create(root: string, cols: number, rows: number, environment?: NodeJS.ProcessEnv): EditorTerminalSession {
    if (this.disposed || this.sessions.size >= 6)
      throw new Error('最多同时保留 6 个终端，请先关闭一个会话。')
    dimensions(cols, rows)
    const shell = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || userInfo().shell || '/bin/sh'
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(environment ?? process.env)) {
      if (value !== undefined && !/^(?:ELECTRON_|NODE_OPTIONS$|NODE_CHANNEL_FD$|QUA_|VITE_QUA_)/u.test(key))
        env[key] = value
    }
    // Login shells read these variables before showing a prompt. Electron's
    // launch environment can contain editor-specific paths; passing them
    // through produces a confusing startup error in every new terminal.
    for (const key of ['BASH_ENV', 'ENV', 'ZDOTDIR'])
      delete env[key]
    env.TERM_PROGRAM = 'QuaEngine'
    env.COLORTERM = 'truecolor'
    const pty = spawn(shell, process.platform === 'win32' ? [] : ['-l'], { cwd: root, cols, rows, name: 'xterm-256color', env })
    pty.pause()
    const info = { id: randomUUID(), root, shell: basename(shell), pid: pty.pid }
    const session: Session = { info, pty, pending: '', sequence: 0, awaiting: true, paused: true }
    this.sessions.set(info.id, session)
    pty.onData((data) => {
      session.pending += data
      if (session.pending.length >= HIGH_WATER && !session.paused) {
        session.pty.pause()
        session.paused = true
      }
      this.schedule(session)
    })
    pty.onExit(({ exitCode }) => {
      session.exit = exitCode
      this.schedule(session)
    })
    // Output starts only after the UI has installed its xterm instance (ack 0).
    return info
  }

  write(id: string, data: string): void {
    if (typeof data !== 'string' || data.length > CHUNK)
      throw new Error('终端输入过长。')
    const session = this.sessions.get(id)
    if (session && session.exit === undefined)
      session.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    dimensions(cols, rows)
    const session = this.sessions.get(id)
    if (session && session.exit === undefined)
      session.pty.resize(cols, rows)
  }

  acknowledge(id: string, sequence: number): void {
    const session = this.sessions.get(id)
    if (!session || !session.awaiting || session.sequence !== sequence)
      return
    session.awaiting = false
    if (session.paused && session.pending.length < HIGH_WATER && session.exit === undefined) {
      session.paused = false
      session.pty.resume()
    }
    this.schedule(session)
  }

  private schedule(session: Session): void {
    if (!this.sessions.has(session.info.id) || session.awaiting || session.timer)
      return
    session.timer = setTimeout(() => {
      session.timer = undefined
      if (session.pending.length) {
        let end = Math.min(CHUNK, session.pending.length)
        // Never split a UTF-16 surrogate pair across transport chunks.
        if (end < session.pending.length && /[\uD800-\uDBFF]/u.test(session.pending[end - 1]))
          end--
        const data = session.pending.slice(0, end)
        session.pending = session.pending.slice(end)
        session.awaiting = true
        this.emit({ type: 'data', id: session.info.id, sequence: ++session.sequence, data })
      }
      else if (session.exit !== undefined && !session.exitSent) {
        session.exitSent = true
        this.emit({ type: 'exit', id: session.info.id, code: session.exit })
      }
    }, 16)
  }

  async close(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session)
      return
    this.sessions.delete(id)
    clearTimeout(session.timer)
    await terminate(session)
    this.emit({ type: 'closed', id })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.sessions.keys()].map(id => this.close(id)))
  }
}

function dimensions(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 300 || rows < 1 || rows > 120)
    throw new Error('无效的终端尺寸。')
}

async function terminate(session: Session): Promise<void> {
  const pid = session.info.pid
  if (session.exit !== undefined)
    return
  if (process.platform === 'win32') {
    await exec('taskkill', ['/pid', String(pid), '/T', '/F'], { timeout: 2500 }).catch(() => {})
  }
  else {
    // Interactive job control gives foreground/background jobs separate process
    // groups. Killing only the shell group would leave those jobs alive.
    const tree = await exec('ps', ['-axo', 'pid=,ppid='], { timeout: 1500, maxBuffer: 4 * 1024 * 1024 }).catch(() => undefined)
    if (tree) {
      const children = new Map<number, number[]>()
      for (const line of tree.stdout.trim().split('\n')) {
        const [child, parent] = line.trim().split(/\s+/u).map(Number)
        const siblings = children.get(parent) ?? []
        siblings.push(child)
        children.set(parent, siblings)
      }
      const descendants = [pid]
      for (let index = 0; index < descendants.length; index++)
        descendants.push(...children.get(descendants[index]) ?? [])
      for (const child of descendants.reverse()) {
        try {
          process.kill(child, 'SIGKILL')
        }
        catch { /* Already exited. */ }
      }
    }
    try {
      process.kill(-pid, 'SIGKILL')
    }
    catch { /* Already exited. */ }
  }
  try {
    session.pty.kill()
  }
  catch { /* PTY was closed by process-tree teardown. */ }
}
