import type { EventListener, PipelineContext } from '@quajs/pipeline'
import { RenderToLogicEvents } from '../events/events'
import { BaseEnginePlugin } from './core/types'

export interface UiOverlayPluginOptions {
  openEvents?: ReadonlyArray<RenderToLogicEvents>
  closeEvents?: ReadonlyArray<RenderToLogicEvents>
  updateEvents?: ReadonlyArray<RenderToLogicEvents>
}

export class UiOverlayPlugin extends BaseEnginePlugin {
  readonly name = 'ui-overlay'
  readonly version = '0.1.0'
  readonly description = 'Maps renderer UI overlay requests to engine-owned overlay state'

  private disposers: Array<() => void> = []
  private readonly openEvents: ReadonlyArray<RenderToLogicEvents>
  private readonly closeEvents: ReadonlyArray<RenderToLogicEvents>
  private readonly updateEvents: ReadonlyArray<RenderToLogicEvents>

  constructor(options: UiOverlayPluginOptions = {}) {
    super({ ...options })
    this.openEvents = options.openEvents || [RenderToLogicEvents.UI_REQUEST_OPEN]
    this.closeEvents = options.closeEvents || [RenderToLogicEvents.UI_REQUEST_CLOSE]
    this.updateEvents = options.updateEvents || [RenderToLogicEvents.UI_REQUEST_UPDATE]
  }

  protected setup(): void {
    if (!this.ctx)
      return

    const { engine, pipeline } = this.ctx
    for (const event of this.openEvents) {
      const listener: EventListener<{ elementId: string, config?: Record<string, unknown> }> = (
        context: PipelineContext<{ elementId: string, config?: Record<string, unknown> }>,
      ) => {
        const payload = context.event.payload
        return engine.showUI(payload.elementId, payload.config || {})
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }

    for (const event of this.closeEvents) {
      const listener: EventListener<{ elementId: string }> = (
        context: PipelineContext<{ elementId: string }>,
      ) => {
        const payload = context.event.payload
        return engine.hideUI(payload.elementId)
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }

    for (const event of this.updateEvents) {
      const listener: EventListener<{ elementId: string, config: Record<string, unknown> }> = (
        context: PipelineContext<{ elementId: string, config: Record<string, unknown> }>,
      ) => {
        const payload = context.event.payload
        return engine.updateUI(payload.elementId, payload.config)
      }
      pipeline.on(event, listener)
      this.disposers.push(() => pipeline.off(event, listener))
    }
  }

  async destroy(): Promise<void> {
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    await super.destroy?.()
  }
}
