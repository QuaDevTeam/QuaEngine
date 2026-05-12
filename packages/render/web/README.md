# @quajs/renderer-web

Framework-neutral Web renderer runtime for QuaEngine.

This package owns browser-side implementation details that are shared by Web renderers:

- pipeline lifecycle wiring through `QuaWebRendererController`
- renderer intent actions over `@quajs/pipeline`
- object URL loading and revocation for `@quajs/assets`
- animation projection helpers
- optional native DOM projection layers under `@quajs/renderer-web/plugins/*`
- WebAudio runtime primitives and renderer controller under `@quajs/renderer-web/audio`
- a React-compatible external-store adapter for `useSyncExternalStore`

Framework renderers such as `@quajs/renderer-vue` should build on this package instead of duplicating Web runtime behavior. The controller remains stateless with respect to game state: it consumes engine-owned view projections and emits user intent events only.

## Sub-entries

- `@quajs/renderer-web`: framework-neutral controller, actions, projection helpers, asset URL handles, DOM renderer shell, and non-audio DOM plugin factories.
- `@quajs/renderer-web/dom`: native DOM renderer shell.
- `@quajs/renderer-web/react`: React-compatible store adapter without a React dependency.
- `@quajs/renderer-web/audio`: `WebAudioAudioRuntime` and `WebAudioRendererController`.
- `@quajs/renderer-web/plugins/core`: DOM renderer plugin layer contracts/helpers.
- `@quajs/renderer-web/plugins/background`
- `@quajs/renderer-web/plugins/sprite`: sprite manifest/expression/atlas/mask/fallback DOM helpers for character projection.
- `@quajs/renderer-web/plugins/character`
- `@quajs/renderer-web/plugins/dialogue`
- `@quajs/renderer-web/plugins/choices`
- `@quajs/renderer-web/plugins/effects`
- `@quajs/renderer-web/plugins/ui`
- `@quajs/renderer-web/plugins/audio`: WebAudio renderer plugin for framework-neutral Web renderer hosts.
- `@quajs/renderer-web/plugins/preset`: visual novel DOM preset, including background, sprite, character, effects, dialogue, choices, audio, and UI overlay projection.

## WebAudio Autoplay

`WebAudioRendererController` attempts to unlock audio automatically when the engine-owned audio projection contains a playing BGM, voice, SFX, or ambient track. If the browser allows playback and the `AudioContext` is already running, sources start immediately and `audio/unlocked` is emitted through the pipeline.

Browser autoplay policy blocks are handled as normal Web runtime behavior, not engine audio errors. When autoplay is blocked, sources remain pending and start after the next configured user activation event. The default unlock events are `pointerdown`, `keydown`, `touchstart`, and `mousedown`; pass `autoUnlock: false` or a custom `unlockEvents` list to `createAudioWebRendererPlugin` or `WebAudioRendererController` when needed.
