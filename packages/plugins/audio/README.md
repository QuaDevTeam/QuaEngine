# @quajs/plugin-audio

Audio intent plugin for QuaEngine. It owns engine-side projection for voice, BGM, SFX, ambient tracks, buses, gain, EQ, automation, and chapter-aware voice mapping.

Actual WebAudio decoding and playback live in `@quajs/renderer-web/audio` and renderer plugin entries. Engine core never performs browser audio work.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { AudioPlugin } from '@quajs/plugin-audio'

const engine = new QuaEngine()

engine.use(new AudioPlugin({
  defaultProjection: {
    buses: {
      master: { gainDb: -3 },
      bgm: { gainDb: -8 },
      voice: { gainDb: 0 },
      sfx: { gainDb: -4 },
      ambient: { gainDb: -10 },
    },
  },
}))
```

Renderer entries:

- `@quajs/renderer-web/plugins/audio`
- `@quajs/renderer-vue/plugins/audio`
- `@quajs/renderer-web/audio` for WebAudio runtime primitives

## Playback API

```ts
import {
  playAmbientWithEngine,
  playBGMWithEngine,
  playSFXWithEngine,
  playVoiceWithEngine,
  stopBGMWithEngine,
} from '@quajs/plugin-audio'

await playBGMWithEngine(engine, 'audio/bgm/night-grid.ogg', {
  loop: true,
  fadeInMs: 800,
})

await playVoiceWithEngine(engine, 'voice/ch01/unit7-001.ogg', {
  characterId: 'unit7',
  lineId: 'unit7-001',
})

await playSFXWithEngine(engine, 'audio/sfx/access-granted.ogg')
await playAmbientWithEngine(engine, 'audio/ambient/rain.ogg', { loop: true })
await stopBGMWithEngine(engine, { fadeOutMs: 500 })
```

## Buses, EQ, And Automation

```ts
import {
  setAudioAutomationWithEngine,
  setAudioEqWithEngine,
  setAudioGainWithEngine,
} from '@quajs/plugin-audio'

await setAudioGainWithEngine(engine, 'bgm', -12, { fadeOutMs: 300 })

await setAudioEqWithEngine(engine, 'voice', [{
  type: 'highpass',
  frequency: 120,
  q: 0.8,
}])

await setAudioAutomationWithEngine(engine, 'master', 'gainDb', {
  points: [
    { at: 0, value: -6 },
    { at: 1000, value: 0 },
  ],
})
```

## Chapter Audio

Chapter directives can provide voice maps and defaults:

```ts
await configureAudioChapterWithEngine(engine, 'ch01', {
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
