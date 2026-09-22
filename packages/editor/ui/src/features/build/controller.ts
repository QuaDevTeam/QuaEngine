import type { EditorBridge, EditorBuildState, EditorProject, PreviewTarget } from '@quajs/editor-core'
import { element, html, render, select } from '@quajs/editor-controls'
import { createEditorBuildSteps } from '@quajs/editor-core'
import { productionBuildView } from './view'
import './styles.scss'

export class ProductionBuild {
  private readonly dialog = element<HTMLDialogElement>(html`<dialog class="production-build" aria-labelledby="production-build-title"></dialog>`)
  private readonly target = select([{ value: 'web', title: 'Web 网站' }, { value: 'native', title: 'macOS 应用' }])
  private state?: EditorBuildState
  private pending = false
  private cancelling = false
  private error = ''
  private preparing = ''
  private startedAt?: number
  private logsOpen = false
  private clock?: ReturnType<typeof setInterval>
  private generation = 0

  constructor(private readonly bridge: EditorBridge, private readonly project: () => EditorProject | undefined, private readonly saveAll: () => Promise<unknown>, private readonly bounds: () => void) {
    this.dialog.id = 'production-build'
    document.body.append(this.dialog)
    this.dialog.addEventListener('close', () => {
      clearInterval(this.clock)
      this.clock = undefined
      bounds()
    })
    this.target.addEventListener('change', () => {
      this.state = undefined
      this.error = ''
      this.logsOpen = false
      this.render()
    })
    bridge.onBuildState(state => this.update(state))
  }

  show(): void {
    const generation = ++this.generation
    this.error = ''
    if (this.state?.root !== this.project()?.root)
      this.state = undefined
    this.render()
    if (!this.dialog.open)
      this.dialog.showModal()
    this.syncClock()
    this.bounds()
    void this.bridge.buildState().then((state) => {
      if (state && generation === this.generation && !this.pending)
        this.update(state)
    }).catch(error => this.fail(error))
  }

  private update(state: EditorBuildState): void {
    if (state.root !== this.project()?.root)
      return
    if (state.phase === 'error' && this.state?.phase !== 'error')
      this.logsOpen = true
    this.state = state
    this.target.value = state.target
    if (this.dialog.open)
      this.render()
    this.syncClock()
  }

  private syncClock(): void {
    const running = this.dialog.open && (this.pending || this.state?.phase === 'building')
    if (running && !this.clock) {
      this.clock = setInterval(() => this.render(), 1000)
    }
    else if (!running) {
      clearInterval(this.clock)
      this.clock = undefined
    }
  }

  private fail(error: unknown): void {
    this.error = String(error)
    this.render()
  }

  private async start(): Promise<void> {
    const project = this.project()
    if (!project || this.pending || this.state?.phase === 'building')
      return
    ++this.generation
    this.pending = true
    this.error = ''
    this.state = undefined
    this.logsOpen = false
    this.startedAt = Date.now()
    this.preparing = '正在保存文档…'
    this.render()
    this.syncClock()
    try {
      await this.saveAll()
      if (this.project()?.root !== project.root)
        throw new Error('项目已切换。')
      this.preparing = '正在准备构建环境…'
      this.render()
      await this.bridge.buildProject(project.root, this.target.value as PreviewTarget)
    }
    catch (error) { this.error = String(error) }
    finally {
      this.pending = false
      this.render()
      this.syncClock()
    }
  }

  private async cancel(): Promise<void> {
    if (this.cancelling)
      return
    this.cancelling = true
    this.render()
    try {
      await this.bridge.cancelBuild()
    }
    catch (error) { this.error = String(error) }
    finally {
      this.cancelling = false
      this.render()
    }
  }

  private render(): void {
    const project = this.project()
    const state = this.state?.root === project?.root ? this.state : undefined
    const busy = this.pending || state?.phase === 'building'
    this.target.disabled = busy
    const steps = state?.steps ?? createEditorBuildSteps(this.target.value as PreviewTarget)
    if (this.pending && !state)
      steps[0] = { ...steps[0], phase: 'running', startedAt: this.startedAt, detail: this.preparing }
    render(productionBuildView({
      project: project?.name ?? '未打开项目',
      target: this.target,
      state,
      steps,
      busy,
      cancelling: this.cancelling,
      error: this.error,
      preparing: this.preparing,
      startedAt: state?.startedAt ?? (busy ? this.startedAt : undefined),
      logsOpen: this.logsOpen,
      canBuild: Boolean(project && !project.pluginProject),
      close: () => this.dialog.close(),
      start: () => void this.start(),
      cancel: () => void this.cancel(),
      reveal: () => void this.bridge.revealBuild().catch(error => this.fail(error)),
      toggleLogs: (open) => { this.logsOpen = open },
    }), this.dialog)
  }
}
