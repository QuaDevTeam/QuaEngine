import type { EngineContext } from '@quajs/engine'
import type { AssetLoadingImage, AssetLoadingProjection, AssetLoadingUpdate } from './contracts'
import { BaseEnginePlugin } from '@quajs/engine'
import { ASSET_LOADING_PLUGIN_ID, ASSET_LOADING_RENDERER_PROGRESS, ASSET_LOADING_RETRY } from './contracts'

export * from './contracts'

/** Await run() before entering the destination scene. Rendering never advances the story. */
export class AssetLoadingPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-asset-loading'
  readonly id = ASSET_LOADING_PLUGIN_ID
  readonly version = '0.1.0'
  private running = false
  private retry?: () => void
  private cancel?: () => void
  private disposed = false
  private preparationSequence = 0
  private disposePreparation?: () => void
  private readonly onRetry = () => { this.retry?.() }
  private readonly blockPlayerInput: Parameters<EngineContext['pipeline']['removeMiddleware']>[0] = async (context, next) => {
    const { type, payload } = context.event
    if (this.getProjection()?.visible && (type.startsWith('user/') || type === 'ui/intent' || type === 'choice/select')) {
      if (type === 'ui/intent' && (payload as { action?: string } | undefined)?.action === 'asset-loading-retry')
        this.onRetry()
      context.handled = true
      return
    }
    await next()
  }

  protected setup(ctx: EngineContext): void {
    this.disposed = false
    ctx.pipeline.on(ASSET_LOADING_RETRY, this.onRetry)
    ctx.pipeline.addMiddleware(this.blockPlayerInput)
  }

  getProjection(): AssetLoadingProjection | undefined {
    return this.getEngine().getPluginProjection<AssetLoadingProjection>(this.id)
  }

  /** Native hosts read local QPK images and acknowledge GPU residency through the pipeline.
   * This preparation never downloads assets or falls back to a remote source.
   * Publish its initial view through the renderer bridge; never await it in a host's
   * synchronous bootstrap export, since rendering must service the request.
   */
  async prepareRenderer(title: string, images: readonly AssetLoadingImage[]): Promise<void> {
    if (images.length > 12 || new Set(images.map(image => `${image.assetType}:${image.assetName}`)).size !== images.length)
      throw new Error('Renderer preparation requires at most 12 unique images')
    const pipeline = this.getEngine().getPipeline()
    await this.run(title, report => new Promise<void>((resolve, reject) => {
      const id = `asset-loading-${++this.preparationSequence}`
      const dispose = () => {
        pipeline.off(ASSET_LOADING_RENDERER_PROGRESS, listener)
        if (this.disposePreparation === dispose) this.disposePreparation = undefined
      }
      const listener: Parameters<typeof pipeline.on>[1] = ({ event }) => {
        if (!event.payload || typeof event.payload !== 'object') return
        const update = event.payload as { id?: string, completed?: number, total?: number, error?: string }
        if (update.id !== id) return
        if (typeof update.error === 'string' && update.error) {
          dispose()
          reject(new Error(update.error))
          return
        }
        if (!Number.isSafeInteger(update.completed) || !Number.isSafeInteger(update.total)
          || update.total !== images.length || update.completed! < 0 || update.completed! > update.total!) return
        report({ progress: update.total ? update.completed! / update.total : 1 })
        if (update.completed === update.total) {
          dispose()
          resolve()
        }
      }
      this.disposePreparation = dispose
      pipeline.on(ASSET_LOADING_RENDERER_PROGRESS, listener)
      report({ phase: 'loading-local', preparation: { id, images }, progress: 0 })
    }))
  }

  async run<T>(title: string, task: (report: (update: AssetLoadingUpdate) => void) => Promise<T>): Promise<T> {
    const engine = this.getEngine()
    if (this.running)
      throw new Error('An asset loading scene is already active')
    if (this.disposed)
      throw new Error('Asset loading plugin is disposed')
    this.running = true
    let cancelled = false
    const cancellation = new Promise<never>((_resolve, reject) => {
      this.cancel = () => {
        cancelled = true
        reject(new Error('Asset loading scene disposed'))
      }
    })
    let attempt = 0
    try {
      while (true) {
        let projection: AssetLoadingProjection = {
          visible: true,
          title,
          state: 'loading',
          phase: 'preparing',
          progress: null,
          loaded: 0,
          total: 0,
          attempt: ++attempt,
        }
        await engine.setPluginProjection(this.id, projection)
        let accepting = true
        let publication = Promise.resolve()
        const report = (update: AssetLoadingUpdate) => {
          if (!accepting || cancelled)
            return
          projection = { ...projection, ...update }
          const snapshot = projection
          publication = publication.then(async () => {
            if (!cancelled)
              await engine.setPluginProjection(this.id, snapshot)
          })
          // The awaited publication below propagates failure; don't emit an unhandled rejection.
          void publication.catch(() => {})
        }
        try {
          const result = await Promise.race([task(report), cancellation])
          accepting = false
          await publication
          if (cancelled)
            throw new Error('Asset loading scene disposed')
          await engine.setPluginProjection(this.id, { ...projection, preparation: undefined, visible: false, state: 'ready', phase: 'ready', progress: 1 })
          return result
        }
        catch (error) {
          accepting = false
          await publication.catch(() => {})
          if (cancelled)
            throw error
          // Install the retry waiter before publishing the error, so immediate intent is safe.
          const retry = new Promise<void>((resolve) => {
            this.retry = () => {
              this.retry = undefined
              resolve()
            }
          })
          await engine.setPluginProjection(this.id, {
            ...projection,
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
          await Promise.race([retry, cancellation])
        }
      }
    }
    finally {
      this.running = false
      this.retry = undefined
      this.cancel = undefined
    }
  }

  override async destroy(): Promise<void> {
    this.disposed = true
    this.disposePreparation?.()
    this.cancel?.()
    this.ctx?.pipeline.off(ASSET_LOADING_RETRY, this.onRetry)
    this.ctx?.pipeline.removeMiddleware(this.blockPlayerInput)
    if (this.ctx)
      await this.ctx.engine.setPluginProjection(this.id, undefined)
    await super.destroy?.()
  }
}

export const Plugin = AssetLoadingPlugin
