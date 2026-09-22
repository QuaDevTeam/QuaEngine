import type { MiddlewareFunction } from '@quajs/pipeline'
import type { EngineContext } from './core/types'
import { RenderToLogicEvents as Events } from '../events/events'
import { BaseEnginePlugin } from './core/types'

const blockedIntents = new Set<string>([
  Events.USER_CHOICE_SELECT,
  Events.UI_INTENT,
  Events.UI_REQUEST_OPEN,
  Events.UI_REQUEST_CLOSE,
  Events.UI_REQUEST_UPDATE,
  Events.GAME_SAVE_REQUEST,
  Events.GAME_LOAD_REQUEST,
  Events.FLOW_CONTROL_SET_MODE_REQUEST,
  Events.FLOW_CONTROL_START_AUTO_REQUEST,
  Events.FLOW_CONTROL_START_SKIP_REQUEST,
  Events.FLOW_CONTROL_START_FAST_FORWARD_REQUEST,
])

/** Optional scene-only viewing mode. Does not capture or write image files. */
export class ScreenshotModePlugin extends BaseEnginePlugin {
  readonly name = 'screenshot-mode'
  readonly id = 'screenshot-mode'
  readonly version = '0.1.0'
  private middleware?: MiddlewareFunction

  protected override setup({ engine, pipeline }: EngineContext): void {
    this.middleware = async (context, next) => {
      const { type, payload } = context.event
      const input = payload as { command?: string, device?: string, pressed?: boolean, repeat?: boolean }
      const active = !engine.getViewState().ui.visible
      if (type === Events.USER_INPUT_COMMAND && input?.command === 'ui:screenshot') {
        context.stopPropagation = true
        if (input.pressed !== false && !input.repeat)
          await this.setEnabled(!active)
        return
      }
      if (active && type === Events.USER_INPUT_COMMAND) {
        context.stopPropagation = true
        const activation = input?.pressed !== false || (input?.device === 'pointer' && input?.command === 'advance')
        if (activation && !input?.repeat && ['ui:cancel', 'ui:menu', 'advance'].includes(input?.command || ''))
          await this.setEnabled(false)
        return
      }
      if (active && type === Events.USER_ADVANCE) {
        context.stopPropagation = true
        // Timed advances are ignored. A deliberate click exits without advancing.
        if (!(payload as { source?: string })?.source?.startsWith('flow-control:'))
          await this.setEnabled(false)
        return
      }
      if (active && blockedIntents.has(type)) {
        context.stopPropagation = true
        return
      }
      await next()
    }
    pipeline.addMiddleware(this.middleware)
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const engine = this.getEngine()
    if (enabled === !engine.getViewState().ui.visible)
      return
    // Commit visibility first so an in-flight advance cannot escape the guard.
    await engine.setUiVisible(!enabled)
    if (enabled)
      await engine.setFlowControlMode('normal')
  }

  async toggle(): Promise<void> {
    await this.setEnabled(this.getEngine().getViewState().ui.visible)
  }

  override async destroy(): Promise<void> {
    if (this.ctx && this.middleware) {
      this.ctx.pipeline.removeMiddleware(this.middleware)
      await this.ctx.engine.setUiVisible(true)
    }
    this.middleware = undefined
    await super.destroy?.()
  }
}
