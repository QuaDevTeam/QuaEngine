import type {
  RendererPluginContext,
  SceneChangePayload,
  SceneTransitionIntent,
} from '@quajs/render-core'
import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'

export const DEFAULT_SCENE_TRANSITION_DURATION = 320

export interface SceneTransitionRenderState {
  active: boolean
  type: SceneTransitionIntent['type']
  duration: number
  easing?: string
  startedAt?: number
  progress: number
  easedProgress: number
}

export type SceneTransitionStoreListener = (state: Readonly<SceneTransitionRenderState>) => void

interface ActiveSceneTransition {
  transition: SceneTransitionIntent
  targetSceneId: string
  startedAt: number
}

const idleSceneTransition: SceneTransitionRenderState = {
  active: false,
  type: 'instant',
  duration: 0,
  progress: 1,
  easedProgress: 1,
}

export class SceneTransitionStore {
  private active?: ActiveSceneTransition
  private context?: RendererPluginContext
  private unsubscribeSceneChange?: () => void
  private frameHandle?: unknown
  private timerHandle?: unknown
  private readonly listeners = new Set<SceneTransitionStoreListener>()

  setup(context: RendererPluginContext): void {
    this.unsubscribeSceneChange?.()
    this.unsubscribeSceneChange = undefined
    this.cancelTick()
    this.active = undefined
    this.context = context
    this.unsubscribeSceneChange = context.onLogicToRender(LogicToRenderEvents.SCENE_CHANGE, (payload) => {
      this.start(payload)
    })
  }

  subscribe(listener: SceneTransitionStoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(now = Date.now()): SceneTransitionRenderState {
    if (!this.active) {
      return idleSceneTransition
    }

    const transition = normalizeSceneTransition(this.active.transition)
    const progress = transition.duration <= 0
      ? 1
      : clamp((now - this.active.startedAt) / transition.duration, 0, 1)
    const easedProgress = easeProgress(progress, transition.easing)
    return {
      active: progress < 1,
      type: transition.type,
      duration: transition.duration,
      easing: transition.easing,
      startedAt: this.active.startedAt,
      progress,
      easedProgress,
    }
  }

  destroy(): void {
    this.unsubscribeSceneChange?.()
    this.unsubscribeSceneChange = undefined
    this.cancelTick()
    this.active = undefined
    this.context = undefined
    this.listeners.clear()
  }

  private start(payload: SceneChangePayload): void {
    this.cancelTick()
    const transition = normalizeSceneTransition(payload.transition)
    if (transition.type === 'instant' || transition.duration <= 0) {
      this.active = undefined
      this.notify()
      void this.context?.emitRenderToLogic(RenderToLogicEvents.SCENE_READY, {
        sceneId: payload.toScene,
        timestamp: Date.now(),
      })
      return
    }

    this.active = {
      transition,
      targetSceneId: payload.toScene,
      startedAt: Date.now(),
    }
    this.notify()
    this.scheduleTick()
  }

  private complete(): void {
    const targetSceneId = this.active?.targetSceneId
    this.active = undefined
    this.notify()
    if (targetSceneId) {
      void this.context?.emitRenderToLogic(RenderToLogicEvents.SCENE_READY, {
        sceneId: targetSceneId,
        timestamp: Date.now(),
      })
    }
  }

  private scheduleTick(): void {
    this.cancelTick()
    if (!this.active) {
      return
    }

    const runtime = globalThis as unknown as {
      requestAnimationFrame?: (callback: FrameRequestCallback) => unknown
      setTimeout?: (callback: () => void, timeout?: number) => unknown
    }
    if (typeof runtime.requestAnimationFrame === 'function') {
      this.frameHandle = runtime.requestAnimationFrame(() => this.tick())
      return
    }
    this.timerHandle = (runtime.setTimeout || setTimeout)(() => this.tick(), 16)
  }

  private cancelTick(): void {
    const runtime = globalThis as unknown as {
      cancelAnimationFrame?: (handle: unknown) => void
      clearTimeout?: (handle: unknown) => void
    }
    if (this.frameHandle !== undefined && typeof runtime.cancelAnimationFrame === 'function') {
      runtime.cancelAnimationFrame(this.frameHandle)
    }
    if (this.timerHandle !== undefined) {
      const clearTimer = runtime.clearTimeout || clearTimeout
      clearTimer(this.timerHandle as never)
    }
    this.frameHandle = undefined
    this.timerHandle = undefined
  }

  private tick(): void {
    this.frameHandle = undefined
    this.timerHandle = undefined
    if (!this.active) {
      return
    }

    const snapshot = this.getSnapshot()
    if (!snapshot.active) {
      this.complete()
      return
    }

    this.notify()
    this.scheduleTick()
  }

  private notify(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
    this.context?.refresh()
  }
}

export function createSceneTransitionStore(): SceneTransitionStore {
  return new SceneTransitionStore()
}

export function sceneTransitionLayerStyle(): Record<string, string | number> {
  return {
    'position': 'absolute',
    'inset': '0',
    'overflow': 'hidden',
    'pointer-events': 'none',
    'z-index': 'var(--qua-scene-transition-z-index, 80)',
  }
}

export function sceneTransitionOverlayStyle(
  state: Readonly<SceneTransitionRenderState>,
): Record<string, string | number> {
  const progress = state.easedProgress
  const hidden = 1 - progress
  const styles: Record<string, string | number> = {
    'position': 'absolute',
    'inset': '0',
    'background': 'var(--qua-scene-transition-color, #000)',
    'opacity': hidden,
    'transform': 'none',
    'pointer-events': 'none',
    'will-change': 'opacity, transform, clip-path',
  }

  switch (state.type) {
    case 'slide_left':
      styles.opacity = 1
      styles.transform = `translateX(${-progress * 100}%)`
      break
    case 'slide_right':
      styles.opacity = 1
      styles.transform = `translateX(${progress * 100}%)`
      break
    case 'slide_up':
      styles.opacity = 1
      styles.transform = `translateY(${-progress * 100}%)`
      break
    case 'slide_down':
      styles.opacity = 1
      styles.transform = `translateY(${progress * 100}%)`
      break
    case 'wipe':
      styles.opacity = 1
      styles['clip-path'] = `inset(0 ${progress * 100}% 0 0)`
      break
    case 'zoom_in':
      styles.transform = `scale(${1 + hidden * 0.12})`
      break
    case 'zoom_out':
      styles.transform = `scale(${0.92 + progress * 0.08})`
      break
    case 'fade':
    case 'crossfade':
    default:
      break
  }

  return styles
}

export function normalizeSceneTransitionClass(type: string): string {
  return type.replace(/[^\w-]/g, '-')
}

function normalizeSceneTransition(transition: SceneTransitionIntent | undefined): SceneTransitionIntent & { duration: number } {
  return {
    type: transition?.type || 'instant',
    duration: positiveNumber(transition?.duration, DEFAULT_SCENE_TRANSITION_DURATION),
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

function easeProgress(progress: number, easing: string | undefined): number {
  switch (easing) {
    case 'ease-in':
      return progress * progress
    case 'ease-out':
      return 1 - (1 - progress) * (1 - progress)
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - (-2 * progress + 2) ** 2 / 2
    case 'linear':
    default:
      return progress
  }
}
