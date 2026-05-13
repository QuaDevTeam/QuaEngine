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

## Stage And Background Projection

The native DOM renderer builds the adaptive aspect-interval stage structure internally. Functional positioning for `.qua-renderer`, `.qua-stage-frame`, `.qua-stage-viewport`, and `.qua-stage` does not depend on optional theme CSS.

Stage contents are separated by projection plane:

- `.qua-stage-scene` applies stage/camera motion to full-stage scene content.
- `.qua-stage-scene-content` contains full-bleed background and scene art.
- `.qua-stage-subject` contains foreground subject content such as characters. Default character staging uses the resolved safe-area center, while explicit `x/y` remain logical stage coordinates and explicit percent fields remain percent-based authoring values.
- `.qua-stage-plane` contains full-stage screen effects and transitions that are not camera transformed.
- `.qua-stage-safe` is positioned to `ResolvedStageLayout.safeArea` and contains dialogue, choices, backlog, and UI overlays.

Default landscape layout adapts from 16:10 to 16:9. Default portrait layout uses a 9:19.5 phone reference and adapts from 9:21 to 9:16 so common mobile screens can fill without black bars.

Use `resolveStageLayout`, `clientPointToStageLogical`, and `stageLogicalToClientPoint` for shared layout and pointer coordinate math. Pipeline payload coordinates should be logical stage coordinates unless a field explicitly names raw browser/client units.

Mobile CSS safe-area insets and `devicePixelRatio` are renderer-local inputs to layout resolution. Safe-area insets are converted from CSS pixels into logical stage pixels and intersected with the aspect safe area. DPR is exposed as physical-pixel metadata for Canvas/WebGL/screenshot paths; it does not change DOM CSS sizing.

Background projection helpers support image, video, and layered backgrounds with shared fit, origin, transform, opacity, blend, filter, and mask semantics. Running background animations are refreshed through transient renderer animation ticks while asset object URLs remain tied to full projection updates.

See `docs/design/mobile-rendering-adaptation.md` and `docs/design/background-composition-animation.md` for the full cross-package design.

## WebAudio Autoplay

`WebAudioRendererController` attempts to unlock audio automatically when the engine-owned audio projection contains a playing BGM, voice, SFX, or ambient track. If the browser allows playback and the `AudioContext` is already running, sources start immediately and `audio/unlocked` is emitted through the pipeline.

Browser autoplay policy blocks are handled as normal Web runtime behavior, not engine audio errors. When autoplay is blocked, sources remain pending and start after the next configured user activation event. The default unlock events are `pointerdown`, `keydown`, `touchstart`, and `mousedown`; pass `autoUnlock: false` or a custom `unlockEvents` list to `createAudioWebRendererPlugin` or `WebAudioRendererController` when needed.
