import type { EditorTerminalEvent, EditorTerminalSession } from '@quajs/editor-core'
import type { UtilityProcess } from 'electron'
import { fileURLToPath } from 'node:url'
import { utilityProcess } from 'electron'

/** Lazy PTY host; no process, native module or timers until first terminal. */
export class TerminalClient {
  private worker?: UtilityProcess
  private stopping?: Promise<void>
  private counter = 0
  private generation = 0
  private readonly sessions = new Set<string>()
  private readonly pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly emit: (event: EditorTerminalEvent) => void) {}

  async create(root: string, cols: number, rows: number, environment?: NodeJS.ProcessEnv): Promise<EditorTerminalSession> {
    const generation = this.generation
    await this.stopping
    if (generation !== this.generation)
      throw new Error('终端项目已切换。')
    const info = await this.request('create', [root, cols, rows, environment], true) as EditorTerminalSession
    if (generation !== this.generation)
      throw new Error('终端项目已切换。')
    this.sessions.add(info.id)
    return info
  }

  async action(method: 'write' | 'resize' | 'acknowledge' | 'close', id: string, ...args: unknown[]): Promise<void> {
    if (!this.sessions.has(id))
      return
    await this.request(method, [id, ...args])
    if (method === 'close') {
      this.sessions.delete(id)
      if (!this.sessions.size && !this.pending.size)
        await this.dispose()
    }
  }

  dispose(): Promise<void> {
    if (this.stopping)
      return this.stopping
    this.generation++
    const worker = this.worker
    this.sessions.clear()
    if (!worker)
      return Promise.resolve()
    this.stopping = (async () => {
      try {
        await this.request('dispose', [])
      }
      finally {
        worker.kill()
        if (this.worker === worker) {
          this.worker = undefined
          this.rejectPending()
        }
      }
    })().finally(() => {
      this.stopping = undefined
    })
    return this.stopping
  }

  private request(method: string, args: unknown[], start = false): Promise<unknown> {
    if (!this.worker && start) {
      const worker = utilityProcess.fork(fileURLToPath(new URL('./terminal-worker.js', import.meta.url)), [], { serviceName: 'QuaEngine Terminal', stdio: 'ignore' })
      this.worker = worker
      worker.on('message', (message) => {
        if (this.worker !== worker)
          return
        if (message.event) {
          this.emit(message.event)
          return
        }
        const pending = this.pending.get(message.id)
        if (!pending)
          return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error)
          pending.reject(new Error(message.error))
        else pending.resolve(message.value)
      })
      worker.on('exit', () => {
        if (this.worker !== worker)
          return
        this.worker = undefined
        this.sessions.clear()
        this.rejectPending()
        this.emit({ type: 'error', message: '终端服务已结束，请新建终端。' })
      })
    }
    const worker = this.worker
    if (!worker)
      return Promise.resolve(undefined)
    if (this.pending.size >= 64)
      return Promise.reject(new Error('终端请求过多，请稍后重试。'))
    const id = ++this.counter
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('终端服务响应超时。'))
      }, 10000)
      this.pending.set(id, { resolve, reject, timer })
      worker.postMessage({ id, method, args })
    })
  }

  private rejectPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('终端服务已关闭。'))
    }
    this.pending.clear()
  }
}
