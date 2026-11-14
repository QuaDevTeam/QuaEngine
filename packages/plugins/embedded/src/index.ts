import type { EngineContext } from '@quajs/engine'
import type { EmbeddedOpen, EmbeddedOutcome, JsonValue } from './protocol'
import { BaseEnginePlugin, LogicToRenderEvents } from '@quajs/engine'
import { cloneEmbeddedJson, embeddedMessage, parseEmbeddedOpen } from './protocol'

export * from './protocol'
export const EMBEDDED_PLUGIN_ID = '@quajs/plugin-embedded'
export const EmbeddedEvents = { complete: 'embedded/complete', cancel: 'embedded/cancel', result: 'embedded/result', ready: 'embedded/ready' } as const
export interface EmbeddedProjection {
  sessionId: string
  parameters: EmbeddedOpen['parameters']
  status: 'active' | 'settling' | 'terminal'
  outcome?: EmbeddedOutcome
}
/** Session authority belongs to the logic plugin and its engine-owned projection. */
export class EmbeddedSessionPlugin extends BaseEnginePlugin {
  readonly name = EMBEDDED_PLUGIN_ID
  readonly id = EMBEDDED_PLUGIN_ID
  readonly version = '0.1.0'
  private settling?: Promise<EmbeddedOutcome>
  readonly request: EmbeddedOpen
  constructor(request: EmbeddedOpen, private hooks: {
    beforeResult?: (outcome: EmbeddedOutcome) => Promise<void>
    onResult?: (outcome: EmbeddedOutcome) => void | Promise<void>
  } = {}) {
    super()
    this.request = parseEmbeddedOpen(request)
  }

  private readonly onComplete = async ({ event }: any) => {
    if (event.payload?.sessionId === this.request.sessionId)
      await this.complete(event.payload.value)
  }

  private readonly onCancel = async ({ event }: any) => {
    if (event.payload?.sessionId === this.request.sessionId)
      await this.cancel()
  }

  protected async setup(ctx: EngineContext): Promise<void> {
    await ctx.engine.setPluginProjection(this.id, { sessionId: this.request.sessionId, parameters: cloneEmbeddedJson(this.request.parameters), status: 'active' } satisfies EmbeddedProjection)
    ctx.pipeline.on(EmbeddedEvents.complete, this.onComplete)
    ctx.pipeline.on(EmbeddedEvents.cancel, this.onCancel)
    ctx.pipeline.on(LogicToRenderEvents.GAME_LOAD, this.rebindSession)
  }

  // Save/load restores narrative progress, never the previous host's session lease.
  private readonly rebindSession = async () => {
    await this.getEngine().setPluginProjection(this.id, { sessionId: this.request.sessionId, parameters: cloneEmbeddedJson(this.request.parameters), status: this.settling ? 'settling' : 'active' } satisfies EmbeddedProjection)
  }

  async onAfterJump(): Promise<void> { await this.rebindSession() }
  async onAfterRollback(): Promise<void> { await this.rebindSession() }

  getProjection(): EmbeddedProjection { return this.getEngine().getPluginProjection<EmbeddedProjection>(this.id)! }
  complete(value: JsonValue): Promise<EmbeddedOutcome> {
    const outcome: EmbeddedOutcome = { status: 'completed', value: cloneEmbeddedJson(value) }
    embeddedMessage(this.request.sessionId, 'result', { outcome })
    return this.settle(outcome)
  }

  cancel(reason = 'host-cancelled'): Promise<EmbeddedOutcome> { return this.settle({ status: 'cancelled', reason: reason.slice(0, 1024) }) }
  fail(error: unknown): Promise<EmbeddedOutcome> { return this.settle({ status: 'error', code: 'STORY_FAILED', message: String(error).slice(0, 4096) }) }
  private settle(outcome: EmbeddedOutcome): Promise<EmbeddedOutcome> {
    if (this.settling)
      return this.settling
    // Reserve before invoking async hooks so completion/cancellation races have one winner.
    this.settling = Promise.resolve().then(async () => {
      const engine = this.getEngine()
      await engine.setPluginProjection(this.id, { ...this.getProjection(), status: 'settling' })
      try {
        await this.hooks.beforeResult?.(cloneEmbeddedJson(outcome))
      }
      catch (error) {
        outcome = { status: 'error', code: 'PERSISTENCE_FAILED', message: String(error).slice(0, 4096) }
      }
      await engine.setPluginProjection(this.id, { ...this.getProjection(), status: 'terminal', outcome })
      try {
        await engine.getPipeline().emit(EmbeddedEvents.result, { sessionId: this.request.sessionId, outcome: cloneEmbeddedJson(outcome) })
      }
      catch (error) {
        outcome = { status: 'error', code: 'RESULT_EVENT_FAILED', message: String(error).slice(0, 4096) }
        await engine.setPluginProjection(this.id, { ...this.getProjection(), status: 'terminal', outcome })
      }
      await this.hooks.onResult?.(cloneEmbeddedJson(outcome))
      return cloneEmbeddedJson(outcome)
    })
    return this.settling
  }

  async destroy(): Promise<void> {
    this.ctx?.pipeline.off(EmbeddedEvents.complete, this.onComplete)
    this.ctx?.pipeline.off(EmbeddedEvents.cancel, this.onCancel)
    this.ctx?.pipeline.off(LogicToRenderEvents.GAME_LOAD, this.rebindSession)
    await super.destroy?.()
  }
}
