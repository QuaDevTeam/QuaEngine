import type { AssetChange, QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { AudioViewProjection } from '@quajs/plugin-audio/contracts'
import type { QuaViewProjection } from '@quajs/render-core'
import {
  AUDIO_PLUGIN_ID,
  AudioRenderToLogicEvents,
  emitAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import { onRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'
import { WebAudioAudioRuntime } from './audio-runtime'

export interface WebAudioRendererControllerOptions {
  getPipeline: () => Pipeline
  getAssets: () => QuaAssets | undefined
  getViewState: () => Readonly<QuaViewProjection>
  autoUnlock?: boolean
  document?: Document
  unlockEvents?: readonly (keyof DocumentEventMap)[]
}

export class WebAudioRendererController {
  readonly runtime: WebAudioAudioRuntime

  private readonly autoUnlock: boolean
  private readonly unlockEvents: readonly (keyof DocumentEventMap)[]
  private subscribedAssets?: QuaAssets
  private stopAdvanceSubscription?: () => void
  private started = false

  private readonly handleAssetChange = (change: AssetChange) => {
    this.runtime.handleAssetChange(change)
    void this.sync()
  }

  private readonly unlockListener = () => {
    void this.runtime.unlock().catch(() => {})
  }

  constructor(private readonly options: WebAudioRendererControllerOptions) {
    this.autoUnlock = options.autoUnlock ?? true
    this.unlockEvents = options.unlockEvents || ['pointerdown', 'keydown', 'touchstart', 'mousedown']
    this.runtime = new WebAudioAudioRuntime(
      () => this.options.getAssets(),
      {
        emit: (type, payload) => emitAudioRenderToLogic(
          this.options.getPipeline(),
          type as any,
          payload as any,
        ),
      },
    )
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.syncAssetSubscription()
    this.stopAdvanceSubscription = onRenderToLogic(
      this.options.getPipeline(),
      RenderToLogicEvents.USER_ADVANCE,
      async (payload) => {
        const interrupted = this.runtime.interruptVoice(payload.source || 'user-advance')
        for (const track of interrupted) {
          await emitAudioRenderToLogic(
            this.options.getPipeline(),
            AudioRenderToLogicEvents.INTERRUPTED,
            track,
          )
        }
      },
    )

    const targetDocument = this.options.document || globalThis.document
    for (const eventName of this.unlockEvents) {
      targetDocument?.addEventListener(eventName, this.unlockListener, { capture: true, passive: true })
    }
  }

  async sync(): Promise<void> {
    this.syncAssetSubscription()
    const projection = this.getAudioProjection()
    if (!projection) {
      return
    }

    try {
      await this.runtime.sync(projection)
      if (this.autoUnlock && hasPlayingAudioIntent(projection)) {
        await this.runtime.tryAutoUnlock()
      }
    }
    catch (error) {
      await emitAudioRenderToLogic(this.options.getPipeline(), AudioRenderToLogicEvents.ERROR, {
        message: error instanceof Error ? error.message : 'Failed to synchronize audio runtime',
        error,
      })
    }
  }

  async destroy(): Promise<void> {
    this.started = false
    this.stopAdvanceSubscription?.()
    this.stopAdvanceSubscription = undefined
    this.cleanupAssetSubscription()

    const targetDocument = this.options.document || globalThis.document
    for (const eventName of this.unlockEvents) {
      targetDocument?.removeEventListener(eventName, this.unlockListener, { capture: true } as AddEventListenerOptions)
    }

    await this.runtime.destroy()
  }

  private getAudioProjection(): AudioViewProjection | undefined {
    return this.options.getViewState().plugins[AUDIO_PLUGIN_ID] as AudioViewProjection | undefined
  }

  private syncAssetSubscription(): void {
    const currentAssets = this.options.getAssets()
    if (currentAssets === this.subscribedAssets) {
      return
    }

    this.cleanupAssetSubscription()
    currentAssets?.on('asset:changed', this.handleAssetChange)
    this.subscribedAssets = currentAssets
  }

  private cleanupAssetSubscription(): void {
    this.subscribedAssets?.off('asset:changed', this.handleAssetChange)
    this.subscribedAssets = undefined
  }
}

function hasPlayingAudioIntent(projection: AudioViewProjection): boolean {
  return projection.bgm?.state === 'playing'
    || projection.voices.some(track => track.state === 'playing')
}
