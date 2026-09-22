import type { EditorBuildState, PreviewTarget } from '@quajs/editor-core'
import type { QuaProductionBuildProgress } from '@quajs/quack/project'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEditorBuildSteps } from '@quajs/editor-core'
import { BuildProgressDecoder } from './build-progress.js'
import { runTool } from './process.js'

/** Owns the complete build process tree; output and state remain bounded. */
export class ProjectBuild {
  private controller?: AbortController
  private pending?: Promise<void>
  private state?: EditorBuildState
  private timer?: ReturnType<typeof setTimeout>
  constructor(private readonly changed: (state: EditorBuildState) => void, private readonly run = runTool) {}
  get busy(): boolean { return Boolean(this.pending) }
  snapshot(): EditorBuildState | undefined { return this.state && { ...this.state, steps: this.state.steps.map(step => ({ ...step })) } }

  start(root: string, target: PreviewTarget, environment: NodeJS.ProcessEnv): Promise<void> {
    if (this.pending)
      throw new Error('已有打包任务正在运行。')
    const controller = new AbortController()
    this.controller = controller
    const startedAt = Date.now()
    const steps = createEditorBuildSteps(target)
    steps[0] = { ...steps[0], phase: 'running', startedAt }
    this.state = { root, target, phase: 'building', message: '正在检查项目…', log: '', steps, startedAt }
    this.emit()
    this.pending = this.build(root, target, environment, controller).finally(() => {
      clearTimeout(this.timer)
      this.timer = undefined
      this.pending = undefined
      this.controller = undefined
      this.emit()
    })
    return this.pending
  }

  async cancel(): Promise<void> {
    this.controller?.abort()
    await this.pending
  }

  private emit(): void {
    const snapshot = this.snapshot()
    if (snapshot)
      this.changed(snapshot)
  }

  private progress(event: QuaProductionBuildProgress): void {
    const state = this.state!
    const index = state.steps.findIndex(step => step.id === event.step)
    const step = state.steps[index]
    if (!step || ['completed', 'skipped', 'error', 'cancelled'].includes(step.phase)
      || state.steps.slice(0, index).some(previous => previous.phase !== 'completed' && previous.phase !== 'skipped')
      || (event.status === 'completed' && step.phase !== 'running')
      || (event.status === 'skipped' && step.id !== 'notarize')) {
      return
    }
    const now = Date.now()
    state.steps[index] = {
      ...step,
      phase: event.status,
      detail: event.status === 'skipped' ? '项目未启用公证' : event.detail,
      startedAt: event.status === 'skipped' ? undefined : step.startedAt ?? now,
      finishedAt: event.status === 'running' ? undefined : now,
      completed: event.completed ?? step.completed,
      total: event.total ?? step.total,
    }
    if (event.status === 'running')
      state.message = `${step.title}…`
    this.emit()
  }

  private async build(root: string, target: PreviewTarget, environment: NodeJS.ProcessEnv, controller: AbortController): Promise<void> {
    let temporary: string | undefined
    try {
      temporary = await mkdtemp(join(tmpdir(), 'qua-production-'))
      const resultFile = join(temporary, 'result.json')
      const cli = join(dirname(fileURLToPath(import.meta.resolve('@quajs/quack/project'))), 'cli/index.js')
      const env = { ...environment }
      delete env.NODE_OPTIONS
      delete env.ELECTRON_RUN_AS_NODE
      const decoder = new BuildProgressDecoder(new Set(this.state!.steps.map(step => step.id)), (event) => {
        if (!controller.signal.aborted)
          this.progress(event)
      })
      await this.run('node', [cli, 'project', 'build', '--target', target, '--result-file', resultFile, '--progress-fd', '3'], root, {
        signal: controller.signal,
        env,
        reportEvent: chunk => decoder.append(chunk),
        report: (text) => {
          this.state!.log = (this.state!.log + text).slice(-64000)
          this.timer ??= setTimeout(() => {
            this.timer = undefined
            this.emit()
          }, 100)
        },
      }, 60 * 60_000)
      controller.signal.throwIfAborted()
      const result = JSON.parse(await readFile(resultFile, 'utf8'))
      if (result.target !== target || typeof result.artifact !== 'string')
        throw new Error('构建未返回有效产物。')
      if (this.state!.steps.some(step => step.phase !== 'completed' && step.phase !== 'skipped'))
        throw new Error('构建未报告全部步骤完成，请查看构建日志。')
      this.state = { ...this.state!, phase: 'completed', message: '生产版本已生成', artifact: result.artifact, signing: result.signing, notarized: result.notarized, finishedAt: Date.now() }
    }
    catch (error) {
      const phase = controller.signal.aborted ? 'cancelled' : 'error'
      const finishedAt = Date.now()
      const steps = this.state!.steps
      const failed = steps.findIndex(step => step.phase === 'running')
      const index = failed >= 0 ? failed : Math.max(0, steps.map(step => step.phase).lastIndexOf('completed'))
      steps[index] = { ...steps[index], phase, finishedAt }
      this.state = { ...this.state!, phase, finishedAt, message: phase === 'cancelled' ? '打包已取消' : `${steps[index].title}失败`, log: `${this.state!.log}\n${String(error)}`.slice(-64000) }
    }
    finally {
      if (temporary)
        await rm(temporary, { recursive: true, force: true })
    }
  }
}
