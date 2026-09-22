import type { EditorAnalysis, EditorDiagnostic, EditorProject, EditorProjectChange, EditorProjectCheck } from '@quajs/editor-core'
import type { ProjectReply, ProjectRequestMethod } from './protocol.js'
import { Worker } from 'node:worker_threads'
import { readProjectDocument } from './documents.js'
import { eslintSource } from './eslint.js'

const languageMethods = new Set<ProjectRequestMethod>(['analyze', 'complete', 'hover', 'signature', 'define', 'format', 'syncDocuments'])
export class ProjectClient {
  private readonly project: WorkerRequests
  private language?: WorkerRequests
  private lint?: WorkerRequests
  private lintError?: string
  private checker?: Worker
  private snapshot?: EditorProject
  private generation = 0
  private closed = false
  constructor(onChange: (change: EditorProjectChange) => void, private readonly onCheck: (check: EditorProjectCheck) => void) {
    this.project = new WorkerRequests('project-worker', (reply) => {
      if (reply.change) {
        this.configure(reply.change.project)
        onChange(reply.change)
      }
    })
  }

  async request<T>(method: ProjectRequestMethod, ...args: unknown[]): Promise<T> {
    if (this.closed)
      throw new Error('项目服务不可用。')
    if (method === 'read') {
      const project = this.snapshot
      const generation = this.generation
      if (!project)
        throw new Error('请先打开项目。')
      const document = await readProjectDocument(project.root, args[0] as string)
      if ((generation !== this.generation && this.snapshot?.root !== project.root) || this.closed)
        throw new Error('项目已切换。')
      return document as T
    }
    if (method === 'check') {
      if (!this.snapshot || args[0] !== this.snapshot.root)
        throw new Error('项目已切换。')
      this.cancelCheck()
      const checker = new Worker(new URL('./check-worker.js', import.meta.url), { workerData: this.snapshot })
      this.checker = checker
      checker.on('message', (reply: ProjectReply) => {
        if (this.checker === checker && reply.check)
          this.onCheck(reply.check)
      })
      checker.on('error', (error) => {
        if (this.checker === checker)
          this.onCheck({ root: this.snapshot!.root, phase: 'error', completed: 0, total: 0, diagnostics: [{ code: 'EDITOR_PROJECT_CHECK', severity: 'error', message: error instanceof Error ? error.message : String(error) }] })
      })
      checker.on('exit', () => {
        if (this.checker === checker)
          this.checker = undefined
      })
      return undefined as T
    }
    if (languageMethods.has(method)) {
      if (!this.snapshot)
        throw new Error('请先打开项目。')
      if (!this.language) {
        this.language = new WorkerRequests('language-worker')
        // FIFO setup precedes the first query, but never delays file opening.
        void this.language.request('configure', this.snapshot).catch(() => {})
      }
      const result = this.language.request<T>(method, ...args)
      if (method === 'analyze' && typeof args[0] === 'string' && eslintSource(args[0])) {
        const [analysis, diagnostics] = await Promise.all([result as Promise<EditorAnalysis>, this.analyzeLint(args[0], args[1] as string)])
        return { ...analysis, diagnostics: [...analysis.diagnostics, ...diagnostics] } as T
      }
      return result
    }
    if (method === 'open')
      this.cancelCheck()
    const result = await this.project.request<T>(method, ...args)
    if (method === 'open')
      this.configure(result as EditorProject)
    return result
  }

  async close(): Promise<void> {
    this.closed = true
    this.cancelCheck()
    await Promise.all([this.project.close(), this.language?.close(), this.lint?.close()])
  }

  private configure(project: EditorProject): void {
    this.cancelCheck()
    // A new worker also clears Node's cache of executable config/plugin modules.
    void this.lint?.close()
    this.lint = undefined
    this.lintError = undefined
    this.generation++
    const changedRoot = this.snapshot?.root !== project.root
    this.snapshot = project
    if (changedRoot && this.language) {
      void this.language.close()
      this.language = undefined
    }
    else if (this.language) {
      void this.language.request('configure', project).catch(() => {})
    }
  }

  private cancelCheck(): void {
    const checker = this.checker
    this.checker = undefined
    if (checker)
      void checker.terminate()
  }

  private async analyzeLint(path: string, text: string): Promise<EditorDiagnostic[]> {
    const generation = this.generation
    try {
      if (this.lintError)
        throw new Error(this.lintError)
      if (!this.lint) {
        this.lint = new WorkerRequests('lint-worker', undefined, 30_000)
        void this.lint.request('configure', this.snapshot).catch(() => {})
      }
      return await this.lint.request<EditorDiagnostic[]>('analyze', path, text)
    }
    catch (error) {
      if (generation !== this.generation || this.closed)
        return []
      this.lintError = error instanceof Error ? error.message : String(error)
      return [{ code: 'ESLint/worker', severity: 'warning', filePath: path, line: 1, column: 1, message: `ESLint 检查不可用：${this.lintError}` }]
    }
  }
}

class WorkerRequests {
  private readonly worker: Worker
  private readonly pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer?: ReturnType<typeof setTimeout> }>()
  private nextId = 0
  private closed = false
  constructor(name: string, onEvent: (reply: ProjectReply) => void = () => {}, private readonly timeout?: number) {
    this.worker = new Worker(new URL(`./${name}.js`, import.meta.url))
    this.worker.on('message', (reply: ProjectReply) => {
      if (reply.id === undefined) {
        onEvent(reply)
        return
      }
      const pending = this.pending.get(reply.id)
      this.pending.delete(reply.id)
      clearTimeout(pending?.timer)
      if (reply.error)
        pending?.reject(new Error(reply.error))
      else pending?.resolve(reply.result)
    })
    this.worker.on('error', error => this.fail(error instanceof Error ? error : new Error(String(error))))
    this.worker.on('exit', () => this.fail(new Error('项目服务已退出，请重新启动编辑器。')))
  }

  request<T>(method: ProjectRequestMethod, ...args: unknown[]): Promise<T> {
    if (this.closed)
      return Promise.reject(new Error('项目服务不可用。'))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = this.timeout
        ? setTimeout(() => {
            this.fail(new Error('ESLint 检查超过 30 秒，已停止。请检查规则或配置，保存后重试。'))
            void this.worker.terminate()
          }, this.timeout)
        : undefined
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      this.worker.postMessage({ id, method, args })
    })
  }

  async close(): Promise<void> {
    this.fail(new Error('项目已切换或编辑器已关闭。'))
    await this.worker.terminate()
  }

  private fail(error: Error): void {
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}
