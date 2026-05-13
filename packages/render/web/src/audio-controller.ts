import type { AssetChange, QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { AudioViewProjection } from '@quajs/plugin-audio/contracts'
import type { QuaViewProjection } from '@quajs/render-core'
import {
  AudioRenderToLogicEvents,
  emitAudioRenderToLogic,
} from '@quajs/plugin-audio/contracts'
import { onRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'
import { WebAudioAudioRuntime } from './audio-runtime'
import { projectAudioProjection } from './projection'

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
  private animationFrame?: number
  private animationTimeout?: ReturnType<typeof setTimeout>
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
      this.cancelAnimationSync()
      return
    }

    try {
      await this.runtime.sync(projection)
      if (this.autoUnlock && hasPlayingAudioIntent(projection)) {
        await this.runtime.tryAutoUnlock()
      }
      this.scheduleAnimationSync()
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
    this.cancelAnimationSync()
    this.cleanupAssetSubscription()

    const targetDocument = this.options.document || globalThis.document
    for (const eventName of this.unlockEvents) {
      targetDocument?.removeEventListener(eventName, this.unlockListener, { capture: true } as AddEventListenerOptions)
    }

    await this.runtime.destroy()
  }

  private getAudioProjection(): AudioViewProjection | undefined {
    return projectAudioProjection<AudioViewProjection>(this.options.getViewState(), Date.now())
  }

  private scheduleAnimationSync(): void {
    this.cancelAnimationSync()
    if (!this.started || !hasRunningAudioAnimation(this.options.getViewState())) {
      return
    }

    const targetWindow = this.options.document?.defaultView || globalThis.window
    const tick = () => {
      this.animationFrame = undefined
      this.animationTimeout = undefined
      if (this.started) {
        void this.sync()
      }
    }
    if (targetWindow && typeof targetWindow.requestAnimationFrame === 'function') {
      this.animationFrame = targetWindow.requestAnimationFrame(tick)
    }
    else {
      this.animationTimeout = setTimeout(tick, 16)
    }
  }

  private cancelAnimationSync(): void {
    const targetWindow = this.options.document?.defaultView || globalThis.window
    if (this.animationFrame !== undefined && targetWindow && typeof targetWindow.cancelAnimationFrame === 'function') {
      targetWindow.cancelAnimationFrame(this.animationFrame)
    }
    if (this.animationTimeout !== undefined) {
      clearTimeout(this.animationTimeout)
    }
    this.animationFrame = undefined
    this.animationTimeout = undefined
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
    || projection.sfx.some(track => track.state === 'playing')
    || projection.ambients.some(track => track.state === 'playing')
}

function hasRunningAudioAnimation(view: Readonly<QuaViewProjection>): boolean {
  return view.animations.some(animation =>
    animation.state === 'running'
    && animation.resolvedTracks.some(track => track.target.startsWith('audioBus:') || track.target.startsWith('audioTrack:')),
  )
}
