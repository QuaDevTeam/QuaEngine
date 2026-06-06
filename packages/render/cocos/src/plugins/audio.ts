import { LogicToRenderEvents, RenderToLogicEvents } from '@quajs/render-core'
import { renderCocosAudio } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createAudioCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/audio',
    setup(context) {
      let frame: number | undefined
      const busAutomationStarts = new Map<string, { signature?: string, startedAt: number }>()
      const sync = () => {
        void renderCocosAudio(context.cocos, { busAutomationStarts }).then(() => {
          schedule()
        }).catch(error => context.reportError(error, {
          message: 'Cocos audio projection failed.',
          phase: 'renderer-cocos:audio',
          pluginName: '@quajs/renderer-cocos/audio',
        }))
      }
      const cancelFrame = () => {
        if (frame !== undefined) {
          context.cocos.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
      }
      const schedule = () => {
        cancelFrame()
        if (!hasDynamicAudioProjection(context.getViewState().plugins.audio))
          return
        frame = context.cocos.host.scheduler.requestFrame(() => {
          frame = undefined
          sync()
        })
      }
      if (!context.cocos.host.audio.setBusEq) {
        context.cocos.reportWarning('Cocos host does not expose audio bus EQ capability; bus EQ projection will skip EQ controls.', {
          pluginName: '@quajs/renderer-cocos/audio',
        })
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(context.onRenderToLogic(RenderToLogicEvents.USER_ADVANCE, (payload) => {
        void context.cocos.interruptAudioTracks('voice', payload.source).catch(error => context.reportError(error, {
          message: 'Cocos voice interrupt failed.',
          phase: 'renderer-cocos:audio-interrupt',
          pluginName: '@quajs/renderer-cocos/audio',
        }))
      }))
      context.addDisposer(() => {
        cancelFrame()
        busAutomationStarts.clear()
      })
      sync()
    },
  })
}

export const audioCocosRendererPlugin = createAudioCocosRendererPlugin()

function hasDynamicAudioProjection(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const projection = value as Record<string, unknown>
  if (hasAutomation(projection.buses))
    return true
  const tracks = [
    projection.bgm,
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
      || /^eq\[\d+\]\.(gainDb|frequency|q|detune)$/.test(item.propertyPath)
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
