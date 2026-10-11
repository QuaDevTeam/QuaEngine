import type { ScreenshotModePlugin } from '@quajs/engine'
import type { createDemoEngineRuntime } from './runtime-shared'

/** Explicit QA entry, shared by review builds. All writes use owning plugins. */
export function createDemoMediaReview(runtime: Awaited<ReturnType<typeof createDemoEngineRuntime>>) {
  const { audio, animation, background, engine } = runtime
  const events: Array<{ type: string, payload: unknown, at: number }> = []
  const listeners = ['audio/ended', 'audio/error', 'audio/interrupted'].map((type) => {
    const listener = ({ event }: { event: { payload: unknown } }) => {
      events.push({ type, payload: JSON.parse(JSON.stringify(event.payload)), at: Date.now() })
      if (events.length > 256)
        events.splice(0, events.length - 256)
    }
    engine.getPipeline().on(type, listener)
    return () => engine.getPipeline().off(type, listener)
  })
  const base = { transition: { type: 'instant' as const }, fit: 'contain' as const }
  const playbackId = () => engine.getViewState().animations.find(item => item.definitionId === 'qa-motion')?.id
  return {
    events: () => events.slice(),
    async command(action: string, value?: number) {
      switch (action) {
        case 'prepare':
          await engine.getPluginById<ScreenshotModePlugin>('screenshot-mode')!.setEnabled(true)
          await audio.stop('master')
          for (const bus of ['master', 'bgm', 'voice', 'sfx', 'ambient'] as const) await audio.setGain(bus, 0)
          await animation.stop()
          await background.setBackground('qa-media/poster.png', base)
          events.length = 0
          break
        case 'channels':
          await audio.playBGM('qa-media/tone-a.wav', { id: 'qa-bgm', loop: true, gainDb: -12, fadeInMs: 400 })
          await audio.playAmbient('qa-media/tone-b.wav', { id: 'qa-ambient', loop: true, gainDb: -18 })
          await audio.playVoice('qa-media/tone-a.wav', { id: 'qa-voice', interruptible: false, gainDb: -12 })
          await audio.playSFX('qa-media/cue.wav', { id: 'qa-sfx', gainDb: -12 })
          break
        case 'pause':
          await audio.pause('bgm')
          break
        case 'resume':
          await audio.resume('bgm')
          break
        case 'seek':
          await audio.seek('bgm', value ?? 1800)
          break
        case 'gain':
          await audio.setGain('bgm', value ?? -18)
          break
        case 'crossfade':
          await audio.playBGM('qa-media/tone-b.wav', { id: 'qa-bgm-next', loop: true, gainDb: -12, crossfadeMs: 500 })
          break
        case 'stop':
          await audio.stop('master', { fadeOutMs: 300 })
          break
        case 'eq':
          await audio.setEq('bgm', [{ type: 'lowpass', frequency: 300, q: 0.7 }])
          break
        case 'dsp-tone':
          await audio.stop('master')
          for (const bus of ['master', 'bgm', 'voice', 'sfx', 'ambient'] as const) {
            await audio.setGain(bus, 0)
            await audio.setEq(bus, [])
          }
          await audio.playBGM('qa-media/tone-a.wav', { id: 'qa-dsp', loop: true, gainDb: -12 })
          break
        case 'eq-case': {
          const types = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'] as const
          for (const target of ['master', 'bgm', 'qa-dsp']) await audio.setEq(target, [])
          await audio.setEq(['qa-dsp', 'bgm', 'master'][(value ?? 0) % 3], [{ type: types[value ?? 0], frequency: 300, gainDb: 6, q: 0.7, detune: 100 }])
          break
        }
        case 'eq-clear':
          for (const target of ['master', 'bgm', 'qa-dsp']) await audio.setEq(target, [])
          break
        case 'rate':
          await audio.setPlaybackRate('bgm', value ?? 1.5)
          break
        case 'rate-end':
          await audio.stop('master')
          await audio.playVoice('qa-media/tone-a.wav', { id: 'qa-rate-end', gainDb: -12, playbackRate: 2, interruptible: false })
          break
        case 'video':
          await audio.stop('master')
          await animation.stop()
          await background.setVideoBackground('qa-media/motion.mp4', { ...base, loop: true, muted: true, playbackRate: 1, seekMs: value ?? 0, poster: 'qa-media/poster.png' })
          break
        case 'animation': {
          await background.setBackground('qa-media/poster.png', base)
          await background.addLayer({ id: 'qa-card', assetName: 'qa-media/card.png', x: 120, y: 240, width: 240, height: 160, fit: 'contain', zIndex: 10 })
          await animation.playTimeline({ id: 'qa-motion', duration: 2000, fill: 'forwards', tracks: [
            { target: 'backgroundLayer:qa-card', property: 'x', keyframes: [{ at: 0, value: 120 }, { at: 2000, value: 1200, easing: 'ease-in-out' }] },
            { target: 'backgroundLayer:qa-card', property: 'y', keyframes: [{ at: 0, value: 240 }, { at: 2000, value: 540 }] },
            { target: 'backgroundLayer:qa-card', property: 'opacity', keyframes: [{ at: 0, value: 0.4 }, { at: 2000, value: 1 }] },
            { target: 'backgroundLayer:qa-card', property: 'rotation', keyframes: [{ at: 0, value: 0 }, { at: 2000, value: 30 }] },
          ] })
          break
        }
        case 'animation-pause':
          if (playbackId())
            await animation.pause(playbackId()!)
          break
        case 'animation-seek':
          if (playbackId())
            await animation.seek(playbackId()!, value ?? 1000)
          break
        case 'animation-resume':
          if (playbackId())
            await animation.resume(playbackId()!)
          break
        case 'animation-stop':
          if (playbackId())
            await animation.stop(playbackId()!)
          break
        case 'finish':
          await audio.stop('master')
          await animation.stop()
          await background.clearBackground()
          await engine.getPluginById<ScreenshotModePlugin>('screenshot-mode')!.setEnabled(false)
          break
        default: throw new Error(`Unknown media review command: ${action}`)
      }
    },
    dispose() { for (const dispose of listeners) dispose() },
  }
}
