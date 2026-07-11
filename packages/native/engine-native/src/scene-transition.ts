import type { EngineContext } from '@quajs/engine'
import type { AnimationTimingFunction, SceneChangePayload, SceneTransitionIntent } from '@quajs/render-core'
import { emitRenderToLogic, LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import { easeProgress } from '@quajs/render-core'

export const DEFAULT_NATIVE_SCENE_TRANSITION_DURATION = 320

export interface NativeSceneTransitionProjection {
  active: true
  type: SceneTransitionIntent['type']
  fromScene?: string
  toScene: string
  duration: number
  easing?: AnimationTimingFunction
  startedAt: number
  progress: number
  easedProgress: number
}

export interface NativeSceneTransitionControllerOptions {
  now?: () => number
  onError?: (error: unknown, sceneId: string) => void
  requestRender?: () => void
}

interface ActiveNativeSceneTransition {
  payload: SceneChangePayload
  transition: SceneTransitionIntent & { duration: number }
  startedAt: number
}

export class NativeSceneTransitionController {
  private active?: ActiveNativeSceneTransition
  private disposeSceneChange?: () => void
  private pipeline?: EngineContext['pipeline']
  private timer?: unknown

  constructor(private readonly options: NativeSceneTransitionControllerOptions = {}) {}

  setup(pipeline: EngineContext['pipeline']): void {
    this.destroy()
    this.pipeline = pipeline
    this.disposeSceneChange = onLogicToRender(pipeline, LogicToRenderEvents.SCENE_CHANGE, (payload) => {
      this.start(payload)
    })
  }

  getSnapshot(now = this.now()): NativeSceneTransitionProjection | undefined {
    const active = this.active
    if (!active)
      return undefined

    const progress = active.transition.duration <= 0
      ? 1
      : clamp((now - active.startedAt) / active.transition.duration, 0, 1)
    if (progress >= 1)
      return undefined

    return {
      active: true,
      type: active.transition.type,
      fromScene: active.payload.fromScene,
      toScene: active.payload.toScene,
      duration: active.transition.duration,
      easing: active.transition.easing,
      startedAt: active.startedAt,
      progress,
      easedProgress: easeProgress(progress, active.transition.easing),
    }
  }

  destroy(): void {
    this.disposeSceneChange?.()
    this.disposeSceneChange = undefined
    this.cancelTimer()
    this.active = undefined
    this.pipeline = undefined
  }

  private start(payload: SceneChangePayload): void {
    this.cancelTimer()
    const transition = normalizeNativeSceneTransition(payload.transition)
    if (transition.type === 'instant' || transition.duration <= 0) {
      this.active = undefined
      this.options.requestRender?.()
      this.emitReady(payload.toScene)
      return
    }

    this.active = {
      payload,
      transition,
      startedAt: this.now(),
    }
    this.options.requestRender?.()
    this.scheduleTick()
  }

  private scheduleTick(): void {
    this.cancelTimer()
    if (!this.active)
      return
    const remaining = Math.max(0, this.active.transition.duration - (this.now() - this.active.startedAt))
    this.timer = this.runtime().setTimeout(() => this.tick(), Math.min(16, remaining))
  }

  private tick(): void {
    this.timer = undefined
    const active = this.active
    if (!active)
      return

    const elapsed = this.now() - active.startedAt
    if (elapsed >= active.transition.duration) {
      const sceneId = active.payload.toScene
      this.active = undefined
      this.options.requestRender?.()
      this.emitReady(sceneId)
      return
    }

    this.options.requestRender?.()
    this.scheduleTick()
  }

  private emitReady(sceneId: string): void {
    const pipeline = this.pipeline
    if (!pipeline)
      return
    void emitRenderToLogic(pipeline, RenderToLogicEvents.SCENE_READY, {
      sceneId,
      timestamp: this.now(),
    }).catch(error => this.options.onError?.(error, sceneId))
  }

  private cancelTimer(): void {
    if (this.timer !== undefined)
      this.runtime().clearTimeout(this.timer)
    this.timer = undefined
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private runtime(): {
    setTimeout: (callback: () => void, timeout: number) => unknown
    clearTimeout: (handle: unknown) => void
  } {
    return globalThis as unknown as {
      setTimeout: (callback: () => void, timeout: number) => unknown
      clearTimeout: (handle: unknown) => void
    }
  }
}

export function normalizeNativeSceneTransition(
  transition: SceneTransitionIntent | undefined,
): SceneTransitionIntent & { duration: number } {
  return {
    type: transition?.type || 'instant',
    duration: positiveNumber(transition?.duration, DEFAULT_NATIVE_SCENE_TRANSITION_DURATION),
    easing: transition?.easing,
    waitForRenderer: transition?.waitForRenderer,
    rendererReadyTimeout: transition?.rendererReadyTimeout,
  }
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
