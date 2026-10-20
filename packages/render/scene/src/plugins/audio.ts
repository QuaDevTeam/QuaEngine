import { RenderToLogicEvents } from '@quajs/render-core'
import { renderSceneAudio } from '../projection'
import { defineSceneRendererPlugin } from './core'
import { createSceneProjectionTask } from './projection-task'

export function createAudioSceneRendererPlugin() {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/audio',
    setup(context) {
      let frame: number | undefined
      let disposed = false
      const busAutomationStarts = new Map<string, { signature?: string, startedAt: number }>()

      const project = createSceneProjectionTask(context, 'audio', async (scene) => {
        await renderSceneAudio(scene, { busAutomationStarts })
        schedule()
      })
      function sync() {
        void project()
      }

      function cancelFrame() {
        if (frame !== undefined) {
          context.scene.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
      }

      function schedule() {
        cancelFrame()
        if (disposed || !hasDynamicAudioProjection(context.getViewState().plugins.audio))
          return
        frame = context.scene.host.scheduler.requestFrame(() => {
          frame = undefined
          sync()
        })
      }
      if (!context.scene.host.audio.setBusEq) {
        context.scene.reportWarning('Scene host does not expose audio bus EQ capability; bus EQ projection will skip EQ controls.', {
          pluginName: '@quajs/renderer-scene/audio',
        })
      }
      context.addDisposer(context.scene.registerAnimationSync(sync))
      context.addDisposer(context.onRenderToLogic(RenderToLogicEvents.USER_ADVANCE, (payload) => {
        void context.scene.interruptAudioTracks('voice', payload.source).catch(error => context.reportError(error, {
          message: 'Scene voice interrupt failed.',
          phase: 'renderer-scene:audio-interrupt',
          pluginName: '@quajs/renderer-scene/audio',
        }))
      }))
      context.addDisposer(() => {
        disposed = true
        cancelFrame()
        busAutomationStarts.clear()
      })
      sync()
    },
  })
}

export const audioSceneRendererPlugin = createAudioSceneRendererPlugin()

function hasDynamicAudioProjection(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const projection = value as Record<string, unknown>
  if (hasAutomation(projection.buses))
    return true
  const tracks = [
    projection.bgm,
    ...(Array.isArray(projection.bgmOutgoing) ? projection.bgmOutgoing : []),
    ...(Array.isArray(projection.voices) ? projection.voices : []),
    ...(Array.isArray(projection.sfx) ? projection.sfx : []),
    ...(Array.isArray(projection.ambients) ? projection.ambients : []),
  ]
  return tracks.some(track => isRecord(track) && (
    hasPositiveNumber(track.fadeInMs)
    || hasPositiveNumber(track.fadeOutMs)
    || hasAutomation(track.automation)
  ))
}

function hasAutomation(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(item => isRecord(item) && typeof item.propertyPath === 'string' && (
      item.propertyPath === 'gainDb'
      || /^eq\[\d+\]\.(?:gainDb|frequency|q|detune)$/.test(item.propertyPath)
    ))
  }
  if (isRecord(value)) {
    return Object.values(value).some(item => isRecord(item) && hasAutomation(item.automation))
  }
  return false
}

function hasPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
