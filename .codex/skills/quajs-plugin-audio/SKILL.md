---
name: quajs-plugin-audio
description: Use, document, or modify @quajs/plugin-audio. Covers audio intent projection, BGM/voice/SFX/ambient playback, buses, gain, EQ, automation, QuaScript audio decorators, WebAudio renderer boundary, settings, runtime package provenance, and validation.
---

# @quajs/plugin-audio

Use this skill for `packages/plugins/audio`, audio renderer entries, audio QuaScript decorators, or audio examples.

## Responsibility

`@quajs/plugin-audio` owns engine-side audio intent projection for voice, BGM, SFX, ambient tracks, buses, gain, EQ, automation, and chapter-aware voice mapping. Actual decoding/playback is renderer work, usually `@quajs/renderer-web/audio` plus `@quajs/renderer-web/plugins/audio`, `@quajs/renderer-vue/plugins/audio`, or `@quajs/renderer-cocos/plugins/audio`.

Engine core must not perform WebAudio or DOM work.

## Setup

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

When `@quajs/plugin-settings` is present, audio contributes developer defaults and player volume preferences. Player settings are profile preferences and are not restored by story save/load.

## Runtime API

Use the initialized plugin instance in game code:

```ts
await audio.playBGM('audio/bgm/night.ogg', { loop: true, fadeInMs: 800 })
await audio.playVoice('voice/ch01/unit7-001.ogg', { characterId: 'unit7', lineId: 'unit7-001' })
await audio.playSFX('audio/sfx/access-granted.ogg')
await audio.playAmbient('audio/ambient/rain.ogg', { loop: true, id: 'rain' })
await audio.stopBGM({ fadeOutMs: 500 })

await audio.setGain('bgm', -12, { fadeOutMs: 300 })
await audio.setEq('voice', [{ type: 'highpass', frequency: 120, q: 0.8 }])
await audio.setAutomation('master', 'gainDb', {
  points: [{ at: 0, value: -6 }, { at: 1000, value: 0 }],
})
```

Compiler/runtime helper exports ending in `WithEngine` are for generated QuaScript and integrations; prefer plugin instance methods in game code.

Compiler lowering exports such as `scriptCompiler` and `createAudioDecoratorCompiler` belong only to `@quajs/plugin-audio/script-compiler`. Do not re-export or import them from the runtime root, because browser apps that only need `AudioPlugin` must not load Babel/compiler dependencies.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-audio/script-compiler`.

```qs
@AudioChapter('ch01', {
  bgm: 'audio/bgm/ch01.ogg',
  voiceMap: {
    'ch01:1': 'voice/ch01/unit7-001.ogg',
    'unit7-custom': 'voice/ch01/unit7-custom.ogg'
  }
})
@PlayBGM('audio/bgm/ch01.ogg', { loop: true, fadeInMs: 600 })
Narrator: Rain folds over the station roof.

@LineId('unit7-custom')
@PlayVoice()
Unit-7: Signal integrity restored.
```

Decorators:

- `@AudioChapter(chapterId, options?)`: configures `voiceMap`, `bgm`, `defaults`, and metadata.
- `@LineId(lineId)`: overrides generated line id for the current dialogue.
- `@PlayVoice(asset?, options?)`: uses `asset` or current chapter `voiceMap[lineId]`; adds `lineId`, `chapterId`, and speaker `characterId` when available.
- `@PlayBGM(asset, options?)`, `@PlaySFX(asset, options?)`, `@PlayAmbient(asset, options?)`.
- `@SetAudioGain(target, value, options?)`.
- `@SetAudioEq(target, bands, options?)`.
- `@SetAudioAutomation(target, propertyPath, curve, options?)`.
- `@StopAudio(target?, options?)`, `@PauseAudio(target?, options?)`, `@ResumeAudio(target?, options?)`, `@SeekAudio(target?, positionMs, options?)`.
- `@StopVoice(options?)`, `@StopBGM(options?)`, `@StopSFX(options?)`, `@StopAmbient(options?)`.

Common targets: `master`, `bgm`, `voice`, `sfx`, `ambient`, plus track ids where supported by projection.

## Animation Integration

For synced fades, use `@quajs/plugin-audio/animation` with `@quajs/plugin-animation`:

```ts
import { fadeBgmIn } from '@quajs/plugin-audio/animation'

await audio.playBGM('audio/bgm/night.ogg', { id: 'scene-bgm', gainDb: -48, loop: true })
await animation.playTimeline(fadeBgmIn({
  target: 'audioTrack:scene-bgm',
  duration: 1200,
  toGainDb: -8,
}))
```

Audio automation and animation keyframe `easing` values use QuaEngine timing function strings such as `easeOutCubic`, `cubic-out`, `ease-in-out`, or `cubic-bezier(...)`.

## Renderer Boundary

Browser autoplay policy is handled by the Web renderer runtime. Autoplay blocks are not engine audio errors; pending tracks should start after a valid user activation unlocks WebAudio. Native window product runtimes may use an opt-in renderer-local backend such as `quajs_native_app`'s `native-window,native-audio-rodio` feature combination; it must consume engine-owned audio projection and QPK-loaded bytes only. The rodio native backend reports naturally finished non-looping tracks as standard `audio/ended` renderer intents, preserves `stopping` long enough to apply renderer-local fade-out, schedules `playAt` / `delayMs`, and applies `fadeInMs` / `fadeOutMs` without mutating engine state. Native audio backends that report completion, interruption, unlock, or playback errors should use `audio/ended`, `audio/interrupted`, `audio/unlocked`, and `audio/error` through the native renderer intent bridge instead of adding a native-specific event path.

Audio handles, decoded buffers, WebAudio nodes, Cocos handles, and scheduling internals are renderer-local transient resources. Engine/store owns audio intent.

## Runtime Packages

Audio asset refs and projections must preserve `contentPackageId` and `requiredRuntimePackages`. Runtime package unload should clear audio entries owned by or dependent on the unloaded package.

## Validation

For audio package changes, run:

```bash
pnpm --filter @quajs/plugin-audio test -- --run
pnpm --filter @quajs/plugin-audio typecheck
pnpm --filter @quajs/plugin-audio build
```

Also run affected renderer audio package tests/builds when renderer projection contracts change.

## Review Checklist

- Does the plugin update engine-owned audio projection only?
- Are WebAudio/Cocos resources kept out of engine/plugin authority?
- Do QuaScript decorators preserve chapter/line id behavior?
- Are settings split into developer defaults and player preferences?
- Are runtime package asset refs package-aware?
- If audio API, decorator, settings, or projection behavior changed, was this skill updated?
