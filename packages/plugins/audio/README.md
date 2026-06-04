# @quajs/plugin-audio

Audio intent plugin for QuaEngine. It owns engine-side projection for voice, BGM, SFX, ambient tracks, buses, gain, EQ, automation, and chapter-aware voice mapping.

Actual WebAudio decoding and playback live in `@quajs/renderer-web/audio` and renderer plugin entries. Engine core never performs browser audio work.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { AudioPlugin } from '@quajs/plugin-audio'

const engine = new QuaEngine()
const audio = new AudioPlugin({
  defaultProjection: {
    buses: {
      master: { gainDb: -3 },
      bgm: { gainDb: -8 },
      voice: { gainDb: 0 },
      sfx: { gainDb: -4 },
      ambient: { gainDb: -10 },
    },
  },
})

engine.use(audio)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/audio`
- `@quajs/renderer-vue/plugins/audio`
- `@quajs/renderer-web/audio` for WebAudio runtime primitives

## Playback API

```ts
await audio.playBGM('audio/bgm/night-grid.ogg', {
  loop: true,
  fadeInMs: 800,
  delayMs: 500,
})

await audio.playVoice('voice/ch01/unit7-001.ogg', {
  characterId: 'unit7',
  lineId: 'unit7-001',
})

await audio.playSFX('audio/sfx/access-granted.ogg')
await audio.playAmbient('audio/ambient/rain.ogg', { loop: true })
await audio.stopBGM({ fadeOutMs: 500 })
```

QuaScript compiler output and runtime integrations import the `*WithEngine` helpers directly. Those helpers are not registered as developer-facing JS plugin APIs; game code should keep the initialized `AudioPlugin` instance and call methods on it instead of threading `engine` through every audio call.

`delayMs` is normalized to a `playAt` timestamp in the engine-owned audio projection. Web renderers decode the track and schedule the WebAudio source against that timestamp; if browser autoplay unlock happens later, the pending track starts as soon as the context is running.

For audio changes that need to line up with visual timelines, use the animation sub-entry. It returns normal `@quajs/plugin-animation` timelines targeting the existing `audioBus:*` and `audioTrack:*` adapters:

```ts
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin } from '@quajs/plugin-audio'
import { fadeBgmIn, fadeBgmOut } from '@quajs/plugin-audio/animation'

const animation = new AnimationPlugin()
const audio = new AudioPlugin()

engine.use(animation).use(audio)
await engine.init()

await audio.playBGM('audio/bgm/night-grid.ogg', {
  id: 'scene-bgm',
  gainDb: -48,
  loop: true,
})
await animation.playTimeline(fadeBgmIn({
  target: 'audioTrack:scene-bgm',
  duration: 1200,
  toGainDb: -8,
}))
await animation.playTimeline(fadeBgmOut({
  target: 'audioTrack:scene-bgm',
  duration: 700,
}), { wait: true })
```

## Buses, EQ, And Automation

```ts
await audio.setGain('bgm', -12, { fadeOutMs: 300 })

await audio.setEq('voice', [{
  type: 'highpass',
  frequency: 120,
  q: 0.8,
}])

await audio.setAutomation('master', 'gainDb', {
  points: [
    { at: 0, value: -6 },
    { at: 1000, value: 0 },
  ],
})
```

## Chapter Audio

Chapter directives can provide voice maps and defaults:

```ts
await audio.configureChapter('ch01', {
  voiceMap: {
    'unit7-001': 'voice/ch01/unit7-001.ogg',
  },
  bgm: 'audio/bgm/ch01.ogg',
})
```

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-audio/script-compiler`.

```qs
@AudioChapter('ch01', { bgm: 'audio/bgm/ch01.ogg' })
@PlayBGM('audio/bgm/ch01.ogg', { loop: true, fadeInMs: 600 })
Narrator: Rain folds over the station roof.

@LineId('unit7-001')
@PlayVoice('voice/ch01/unit7-001.ogg')
Unit-7: Signal integrity restored.
```

Decorators include `@PlayVoice`, `@PlayBGM`, `@PlaySFX`, `@PlayAmbient`, gain/EQ/automation decorators, and stop/pause/resume/seek decorators.

## Settings And Autoplay

When `@quajs/plugin-settings` is installed, audio contributes developer defaults and player volume preferences. Player settings are profile preferences and are not restored by story save/load.

Browser autoplay policy is handled by the Web renderer runtime. Autoplay blocks are not engine audio errors; pending tracks resume after a valid user activation unlocks WebAudio.

## Runtime Packages

Audio track projections preserve `contentPackageId` and `requiredRuntimePackages`. Package unload clears audio entries owned by the unloaded package.
