import type { PreviewTarget } from '../contracts/project.js'
import type { PreviewDriver, PreviewHandle, PreviewIdentity, PreviewState } from './contracts.js'
/** Owns editor process lifecycle only. Game state lives in each preview's engine. */
export class PreviewController {
  private generation = 0
  private activeGeneration = -1
  private pending: Promise<void> = Promise.resolve()
  private abort?: AbortController
  private handle?: PreviewHandle
  private muted = false
  private state: PreviewState = { phase: 'idle' }
  constructor(private readonly options: {
    loadDriver: (target: PreviewTarget) => Promise<PreviewDriver>
    changed: (state: PreviewState) => void
    log: (identity: PreviewIdentity, message: string) => void
    createId: () => string
    issue?: (identity: PreviewIdentity, message?: string) => void
  }) {
  }

  getSnapshot(): PreviewState {
    return { ...this.state, muted: this.muted }
  }

  setMuted(muted: boolean): Promise<void> {
    this.muted = muted
    this.options.changed(this.getSnapshot())
    const generation = this.generation
    return this.enqueue(async () => {
      if (generation !== this.generation || !this.handle || this.abort?.signal.aborted)
        return
      try {
        await this.handle.setMuted?.(this.muted)
      }
      catch (error) {
        if (generation === this.generation && !this.abort?.signal.aborted)
          throw error
      }
    })
  }

  getHandle(sessionId: string): PreviewHandle {
    if (!this.isCurrentSession(sessionId) || !this.handle)
      throw new Error('Preview session is no longer running.')
    return this.handle
  }

  isCurrentSession(sessionId: string): boolean {
    return this.state.phase === 'running' && this.state.identity?.sessionId === sessionId
      && this.activeGeneration === this.generation && !this.abort?.signal.aborted
  }

  start(request: {
    target: PreviewTarget
    projectRoot: string
    script: string
    buildRevision: string
    reloading?: boolean
  }): Promise<void> {
    const generation = ++this.generation
    this.abort?.abort()
    const abort = new AbortController()
    this.abort = abort
    const identity: PreviewIdentity = {
      target: request.target,
      sessionId: this.options.createId(),
      buildRevision: request.buildRevision,
    }
    return this.enqueue(async () => {
      await this.release()
      if (generation !== this.generation)
        return
      this.publish({ phase: 'starting', identity })
      try {
        const driver = await this.options.loadDriver(request.target)
        abort.signal.throwIfAborted()
        const handle = await driver.start({
          ...request,
          ...identity,
          muted: this.muted,
          signal: abort.signal,
          progress: (progress) => {
            if (generation === this.generation && !abort.signal.aborted && this.state.phase === 'starting')
              this.publish({ ...this.state, progress: { ...progress, label: progress.label.slice(0, 120), detail: progress.detail?.slice(-240) } })
          },
          issue: (message) => {
            if (generation === this.generation && !abort.signal.aborted)
              this.options.issue?.(identity, message)
          },
          log: (message) => {
            if (generation === this.generation)
              this.options.log(identity, message)
          },
          failed: (error) => {
            if (generation !== this.generation || abort.signal.aborted)
              return
            abort.abort()
            void this.enqueue(async () => {
              await this.release()
              if (generation === this.generation)
                this.publish({ phase: 'error', identity, error: error.message })
            }).catch(() => {
            })
          },
        })
        this.handle = handle
        if (abort.signal.aborted || generation !== this.generation) {
          await this.release()
          return
        }
        let appliedMute: boolean
        do {
          appliedMute = this.muted
          await handle.setMuted?.(appliedMute)
        } while (appliedMute !== this.muted && !abort.signal.aborted && generation === this.generation)
        if (abort.signal.aborted || generation !== this.generation) {
          await this.release()
          return
        }
        this.activeGeneration = generation
        this.publish({ phase: 'running', identity, ...(handle.nativeViewport ? { nativeViewport: handle.nativeViewport } : {}) })
      }
      catch (error) {
        if (this.handle)
          await this.release()
        if (generation !== this.generation || abort.signal.aborted)
          return
        this.publish({ phase: 'error', identity, error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    })
  }

  stop(): Promise<void> {
    const generation = ++this.generation
    this.abort?.abort()
    return this.enqueue(async () => {
      await this.release()
      if (generation === this.generation)
        this.publish({ phase: 'idle' })
    })
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.pending.catch(() => {
    }).then(action)
    this.pending = next
    return next
  }

  private async release(): Promise<void> {
    if (!this.handle)
      return
    this.publish({ phase: 'stopping', identity: this.state.identity })
    // Keep ownership when teardown fails; do not start a second backend.
    try {
      await this.handle.stop()
    }
    catch (error) {
      this.publish({ phase: 'error', identity: this.state.identity, error: `停止预览失败：${error instanceof Error ? error.message : String(error)}。可再次停止以重试。` })
      throw error
    }
    this.handle = undefined
  }

  private publish(state: PreviewState): void {
    this.state = state
    this.options.changed(this.getSnapshot())
  }
}
