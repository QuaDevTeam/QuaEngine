import type { SceneChangePayload, SceneTransitionIntent } from '@quajs/render-core'
import type { CocosRendererPluginContext } from '../types'
import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'

const DEFAULT_SCENE_TRANSITION_DURATION = 320

export function createSceneCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/scene',
    setup(context) {
      let frame: number | undefined
      let active: {
        payload: SceneChangePayload
        transition: SceneTransitionIntent & { duration: number }
        startedAt: number
      } | undefined
      const cancelFrame = () => {
        if (frame !== undefined) {
          context.cocos.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
      }
      const complete = async () => {
        const payload = active?.payload
        active = undefined
        cancelFrame()
        context.cocos.clearLayer('scene')
        if (payload?.toScene) {
          await context.emitRenderToLogic(RenderToLogicEvents.SCENE_READY, {
            sceneId: payload.toScene,
            timestamp: context.cocos.host.runtime.now(),
          })
        }
      }
      const completeSafely = () => {
        void complete().catch(error => context.reportError(error, {
          message: 'Cocos scene readiness intent dispatch failed.',
          phase: 'renderer-cocos:scene-ready',
        }))
      }
      const tick = () => {
        frame = undefined
        if (!active)
          return
        const progress = transitionProgress(active.transition, active.startedAt, context.cocos.host.runtime.now())
        renderSceneTransition(context, active.payload, active.transition, progress)
        if (progress >= 1) {
          completeSafely()
          return
        }
        frame = context.cocos.host.scheduler.requestFrame(tick)
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.SCENE_CHANGE, (payload) => {
        cancelFrame()
        const transition = normalizeTransition(payload.transition)
        active = {
          payload,
          transition,
          startedAt: context.cocos.host.runtime.now(),
        }
        if (transition.type === 'instant' || transition.duration <= 0) {
          completeSafely()
          return
        }
        tick()
      }))
      context.addDisposer(cancelFrame)
    },
  })
}

export const sceneCocosRendererPlugin = createSceneCocosRendererPlugin()

function renderSceneTransition(
  context: CocosRendererPluginContext,
  payload: SceneChangePayload,
  transition: SceneTransitionIntent & { duration: number },
  progress: number,
): void {
  const layer = context.cocos.getLayerNode('scene', 'scene-layer', 80)
  context.cocos.host.nodes.clearChildren(layer)
  const layout = context.cocos.getStageLayout()
  const overlay = context.cocos.host.nodes.createNode('scene-transition', { parent: layer, name: 'scene-transition' })
  const eased = easeProgress(progress, transition.easing)
  const hidden = 1 - eased
  context.cocos.host.nodes.setNodeTransform(overlay, {
    x: transition.type === 'slide_left'
      ? -layout.logicalWidth * eased
      : transition.type === 'slide_right'
        ? layout.logicalWidth * eased
        : 0,
    y: transition.type === 'slide_up'
      ? -layout.logicalHeight * eased
      : transition.type === 'slide_down'
        ? layout.logicalHeight * eased
        : 0,
    width: layout.logicalWidth,
    height: layout.logicalHeight,
    opacity: transition.type.startsWith('slide_') ? 1 : hidden,
    scaleX: transition.type === 'zoom_in' ? 1 + hidden * 0.12 : transition.type === 'zoom_out' ? 0.92 + eased * 0.08 : 1,
    scaleY: transition.type === 'zoom_in' ? 1 + hidden * 0.12 : transition.type === 'zoom_out' ? 0.92 + eased * 0.08 : 1,
    zIndex: 0,
  })
  context.cocos.host.nodes.setNodeMetadata?.(overlay, {
    plugin: 'scene',
    fromScene: payload.fromScene,
    toScene: payload.toScene,
    transition,
    progress,
    easedProgress: eased,
  })
  context.cocos.host.nodes.setNodeColor?.(overlay, '#000000')
}

function normalizeTransition(transition: SceneTransitionIntent | undefined): SceneTransitionIntent & { duration: number } {
  return {
    type: transition?.type || 'instant',
    duration: positiveNumber(transition?.duration, DEFAULT_SCENE_TRANSITION_DURATION),
    easing: transition?.easing,
    waitForRenderer: transition?.waitForRenderer,
    rendererReadyTimeout: transition?.rendererReadyTimeout,
  }
}

function transitionProgress(transition: SceneTransitionIntent & { duration: number }, startedAt: number, now: number): number {
  if (transition.duration <= 0)
    return 1
  return Math.min(1, Math.max(0, (now - startedAt) / transition.duration))
}

function easeProgress(progress: number, easing: string | undefined): number {
  switch (easing) {
    case 'ease-in':
      return progress * progress
    case 'ease-out':
      return 1 - (1 - progress) * (1 - progress)
    case 'ease-in-out':
      return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2
    case 'linear':
    default:
      return progress
  }
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : fallback
}
