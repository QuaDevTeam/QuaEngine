import type { EditorAnalysis, EditorDocument, EditorProject, PreviewCommand, PreviewCommandResult, PreviewState } from '@quajs/editor-core'
import type { ProjectClient } from '../project-service/client.js'
import { randomUUID } from 'node:crypto'
import { PreviewController, resolveReloadStep } from '@quajs/editor-core'

type Start = Parameters<PreviewController['start']>[0]
/** Owns development reload scheduling, never narrative state or renderer projections. */
export class PreviewWorkbench {
  readonly controller: PreviewController
  private request?: Start
  private position?: PreviewCommandResult
  private source?: {
    path: string
    steps: { index: number, text: string }[]
  }

  private busy = false
  private reloadTask?: Promise<void>
  private queued = false
  private timer?: ReturnType<typeof setTimeout>
  private epoch = 0
  private activity: Pick<PreviewState, 'reloading' | 'renderError' | 'message'> = {}
  private state: PreviewState = { phase: 'idle' }
  constructor(private readonly project: ProjectClient, private readonly options: ConstructorParameters<typeof PreviewController>[0]) {
    this.controller = new PreviewController({ ...options, changed: (state) => {
      this.state = state
      this.publish()
    }, issue: (_identity, message) => {
      this.activity.renderError = message
      this.publish()
    } })
  }

  getSnapshot(): PreviewState {
    return { ...this.state, ...this.activity }
  }

  getHandle(id: string) {
    return this.controller.getHandle(id)
  }

  isCurrentSession(id: string): boolean {
    return this.controller.isCurrentSession(id)
  }

  async start(request: Start): Promise<void> {
    ++this.epoch
    clearTimeout(this.timer)
    this.queued = false
    this.position = undefined
    this.source = undefined
    this.activity = {}
    this.request = request
    await this.controller.start(request)
  }

  async stop(): Promise<void> {
    ++this.epoch
    clearTimeout(this.timer)
    this.request = undefined
    this.queued = false
    this.activity = {}
    await this.controller.stop()
  }

  changed(before: EditorProject, after: EditorProject): void {
    if (before.root !== after.root || after.root !== this.request?.projectRoot)
      return
    const key = (project: EditorProject) => new Map(project.entries.filter(entry => entry.path !== 'assets/scripts/native-app.mjs').map(entry => [entry.path, `${entry.modified}:${entry.size}`]))
    const old = key(before)
    const next = key(after)
    if (old.size === next.size && [...next].every(([path, value]) => old.get(path) === value))
      return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.reload().catch(() => { }), 220)
  }

  async command(id: string, command: PreviewCommand): Promise<PreviewCommandResult> {
    // Sampling and edit acknowledgements must not contend with playback commands.
    if (command.action === 'debug' && (command.request.kind === 'read' || command.request.kind === 'reply')) {
      if (this.activity.reloading)
        throw new Error('正在更新预览，请稍候。')
      const handle = this.getHandle(id)
      if (!handle.command)
        throw new Error('项目尚未接入编辑器预览控制。')
      const result = await handle.command(command)
      if (!this.isCurrentSession(id))
        throw new Error('预览已切换。')
      return result
    }
    if (this.busy || this.activity.reloading)
      throw new Error('正在更新预览，请稍候。')
    this.busy = true
    const epoch = this.epoch
    try {
      const handle = this.getHandle(id)
      if (!handle.command)
        throw new Error('项目尚未接入编辑器预览控制。')
      const result = await handle.command(command)
      if (!this.isCurrentSession(id))
        throw new Error('预览已切换。')
      if (command.action !== 'debug')
        this.position = result
      if (result.path && this.source?.path !== result.path)
        this.source = await this.readSteps(result.path)
      return result
    }
    catch (error) {
      if (epoch === this.epoch && command.action !== 'debug' && !command.action.startsWith('animation-')) {
        this.activity.renderError = message(error)
        this.publish()
      }
      throw error
    }
    finally {
      this.busy = false
      if (this.queued)
        void this.reload().catch(() => { })
    }
  }

  reload(): Promise<void> {
    if (!this.request)
      return Promise.resolve()
    this.queued = true
    if (this.busy)
      return Promise.resolve()
    if (this.reloadTask)
      return this.reloadTask
    const epoch = this.epoch
    const task = (async () => {
      while (this.queued && this.request && epoch === this.epoch) {
        this.queued = false
        this.activity = { reloading: true, message: '正在更新预览…' }
        this.publish()
        try {
          const id = this.state.identity?.sessionId
          const handle = id && this.controller.isCurrentSession(id) ? this.controller.getHandle(id) : undefined
          if (handle?.command) {
            const current = await handle.command({ action: 'status' }).catch(() => undefined)
            if (current?.path)
              this.position = current
          }
          let nextSource: {
            path: string
            steps: { index: number, text: string }[]
          } | undefined
          let stepIndex = 0
          let reset = false
          if (this.position?.path && this.source?.path === this.position.path) {
            try {
              nextSource = await this.readSteps(this.position.path)
              const mapped = resolveReloadStep(this.source.steps.map(step => step.text), nextSource.steps.map(step => step.text), this.source.steps.findIndex(step => step.index === this.position?.stepIndex))
              stepIndex = nextSource.steps[mapped.index]?.index || 0
              reset = mapped.reset
            }
            catch (error) {
              if (/ENOENT|不在项目|not found|不存在/iu.test(message(error))) {
                this.position = undefined
                reset = true
              }
              else {
                throw error
              }
            }
          }
          if (epoch !== this.epoch)
            return
          if (handle?.reload)
            await handle.reload()
          else
            await this.controller.start({ ...this.request, buildRevision: randomUUID(), reloading: true })
          if (epoch !== this.epoch)
            return
          const currentId = this.state.identity?.sessionId
          const currentHandle = currentId ? this.controller.getHandle(currentId) : undefined
          if (nextSource?.steps.length && currentHandle?.command) {
            this.position = await currentHandle.command({ action: 'seek', path: nextSource.path, stepIndex })
            this.source = nextSource
          }
          else {
            this.position = undefined
            this.source = undefined
          }
          if (epoch === this.epoch) {
            this.activity = { ...this.activity, reloading: false, message: this.activity.renderError ? '渲染失败' : reset ? '原步骤已删除，已从起点重新预览' : '预览已更新' }
            this.publish()
          }
        }
        catch (error) {
          if (epoch !== this.epoch)
            return
          this.activity = { renderError: message(error), message: '渲染失败' }
          this.publish()
        }
      }
    })()
    this.reloadTask = task.finally(() => {
      this.reloadTask = undefined
      if (this.queued)
        void this.reload().catch(() => { })
    })
    return this.reloadTask
  }

  private async readSteps(path: string): Promise<{
    path: string
    steps: { index: number, text: string }[]
  }> {
    const document = await this.project.request<EditorDocument>('read', path)
    const analysis = await this.project.request<EditorAnalysis>('analyze', document.path, document.text)
    const errors = analysis.diagnostics.filter(diagnostic => diagnostic.severity === 'error')
    if (errors.length)
      throw new Error(errors.slice(0, 12).map(error => `${path}:${error.line || 1} ${error.message}`).join('\n'))
    const lines = document.text.split(/\r?\n/u)
    return { path, steps: analysis.previewSteps.map(step => ({ index: step.index, text: lines.slice(step.line - 1, step.endLine).join('\n').trim() })) }
  }

  private publish(): void {
    this.options.changed(this.getSnapshot())
  }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
