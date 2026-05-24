import type { QuaWebRendererController, QuaWebRendererSnapshot } from './controller'
import type { QuaWebDomRendererOptions } from './dom'
import { QuaWebDomRenderer } from './dom'

export type QuaWebDomRendererHostOptions = QuaWebDomRendererOptions

export type QuaWebDomRendererHostListener = (snapshot: QuaWebRendererSnapshot | undefined) => void

export class QuaWebDomRendererHost {
  private renderer?: QuaWebDomRenderer
  private options: QuaWebDomRendererHostOptions
  private mounted = false
  private operation = Promise.resolve()
  private controllerUnsubscribe?: () => void
  private readonly listeners = new Set<QuaWebDomRendererHostListener>()

  constructor(options: QuaWebDomRendererHostOptions) {
    this.options = options
  }

  getRenderer(): QuaWebDomRenderer | undefined {
    return this.renderer
  }

  getController(): QuaWebRendererController | undefined {
    return this.renderer?.controller
  }

  getSnapshot(): QuaWebRendererSnapshot | undefined {
    return this.renderer?.controller.getSnapshot()
  }

  subscribe(listener: QuaWebDomRendererHostListener): () => void {
    this.listeners.add(listener)
    this.syncControllerSubscription()
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.controllerUnsubscribe?.()
        this.controllerUnsubscribe = undefined
      }
    }
  }

  mount(): Promise<void> {
    return this.enqueue(async () => {
      if (this.mounted) {
        return
      }

      this.mounted = true
      this.renderer = new QuaWebDomRenderer(this.options)
      await this.renderer.mount()
      this.syncControllerSubscription()
      this.notify()
    })
  }

  update(options: QuaWebDomRendererHostOptions): Promise<void> {
    return this.enqueue(async () => {
      const shouldRecreate = this.shouldRecreate(options)
      this.options = options

      if (!this.mounted) {
        return
      }

      if (!this.renderer || shouldRecreate) {
        await this.renderer?.unmount()
        this.renderer = new QuaWebDomRenderer(this.options)
        await this.renderer.mount()
        this.syncControllerSubscription()
        this.notify()
        return
      }

      this.renderer.controller.setPipeline(options.pipeline)
      this.renderer.controller.setAssets(options.assets)
    })
  }

  destroy(): Promise<void> {
    return this.enqueue(async () => {
      this.mounted = false
      const renderer = this.renderer
      this.renderer = undefined
      await renderer?.unmount()
      this.syncControllerSubscription()
      this.notify()
    })
  }

  private shouldRecreate(options: QuaWebDomRendererHostOptions): boolean {
    return options.container !== this.options.container
      || options.plugins !== this.options.plugins
      || options.unstyled !== this.options.unstyled
      || options.runtimePluginLoader !== this.options.runtimePluginLoader
      || options.autoReady !== this.options.autoReady
      || options.rendererId !== this.options.rendererId
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.operation.then(task, task)
    this.operation = next.catch(() => {})
    return next
  }

  private syncControllerSubscription(): void {
    this.controllerUnsubscribe?.()
    this.controllerUnsubscribe = undefined
    const controller = this.getController()
    if (controller && this.listeners.size > 0) {
      this.controllerUnsubscribe = controller.subscribe(snapshot => this.notify(snapshot))
    }
  }

  private notify(snapshot = this.getSnapshot()): void {
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export function createQuaWebDomRendererHost(options: QuaWebDomRendererHostOptions): QuaWebDomRendererHost {
  return new QuaWebDomRendererHost(options)
}
