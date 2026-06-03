# @quajs/renderer-web

Framework-neutral Web renderer runtime for QuaEngine.

This package owns browser-side implementation details that are shared by Web renderers:

- pipeline lifecycle wiring through `QuaWebRendererController`
- renderer intent actions over `@quajs/pipeline`
- object URL loading and revocation for `@quajs/assets`
- animation projection helpers
- renderer input command mapping for keyboard, pointer, and gamepad devices
- optional native DOM projection layers under `@quajs/renderer-web/plugins/*`
- WebAudio runtime primitives and renderer controller under `@quajs/renderer-web/audio`
- a React-compatible external-store adapter for `useSyncExternalStore`

Framework renderers such as `@quajs/renderer-vue`, `@quajs/renderer-react`, and `@quajs/renderer-svelte` should build on this package instead of duplicating Web runtime behavior. The controller remains stateless with respect to game state: it consumes engine-owned view projections and emits user intent events only.

## Sub-entries

- `@quajs/renderer-web`: framework-neutral controller, actions, projection helpers, asset URL handles, DOM renderer shell, and shared Web runtime helpers.
- `@quajs/renderer-web/dom`: native DOM renderer shell.
- `@quajs/renderer-web/input`: framework-neutral input controller and default keyboard/pointer/gamepad bindings.
- `@quajs/renderer-web/react`: React-compatible store adapter without a React dependency.
- `@quajs/renderer-web/audio`: `WebAudioAudioRuntime` and `WebAudioRendererController`.
- `@quajs/renderer-web/plugins/core`: DOM renderer plugin layer contracts/helpers.
- `@quajs/renderer-web/plugins/achievement`
- `@quajs/renderer-web/plugins/audio`: WebAudio renderer plugin for framework-neutral Web renderer hosts.
- `@quajs/renderer-web/plugins/background`
- `@quajs/renderer-web/plugins/backlog`
- `@quajs/renderer-web/plugins/sprite`: sprite manifest/expression/atlas/mask/fallback DOM helpers for character projection.
- `@quajs/renderer-web/plugins/character`
- `@quajs/renderer-web/plugins/dialogue`
- `@quajs/renderer-web/plugins/choices`
- `@quajs/renderer-web/plugins/effects`
- `@quajs/renderer-web/plugins/fonts`
- `@quajs/renderer-web/plugins/gallery`
- `@quajs/renderer-web/plugins/ui`
- `@quajs/renderer-web/plugins/input`: optional input plugin that maps physical inputs to semantic renderer commands and existing render-to-logic intents.
- `@quajs/renderer-web/plugins/scene`
- `@quajs/renderer-web/plugins/settings`: schema-driven settings panel projection for `@quajs/plugin-settings`.
- `@quajs/renderer-web/plugins/preset`: visual novel DOM preset, including input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, and achievement projection.

The settings DOM plugin renders native browser form controls by default and publishes stable styling hooks: `.qua-settings-field-main`, `.qua-settings-field-copy`, `.qua-settings-field-control`, `.qua-settings-control`, plus field-level `data-settings-control/type/readonly/invalid` attributes. Use `renderCustomControl` for custom controls in framework-neutral DOM hosts; framework adapters can layer slots over the same projection without making the renderer authoritative for settings state. Component-library integrations such as Radix, Reka UI, or project-local design-system controls should live in app code or adapter packages, not as hard dependencies of `@quajs/renderer-web`.

## Renderer Input

`createInputWebRendererPlugin()` and `createRendererInputController()` map transient Web input into semantic renderer commands. The input layer does not own game state or decide narrative progression. It emits `RenderToLogicEvents.USER_INPUT_COMMAND` first for audit/plugin observation, then calls the existing renderer action for built-in commands such as `USER_ADVANCE`, `FLOW_CONTROL_START_SKIP_REQUEST`, or `FLOW_CONTROL_START_FAST_FORWARD_REQUEST`.

Default keyboard bindings:

- `Enter`, `Space`, `ArrowLeft`, `ArrowRight`, `PageDown`: advance
- `ControlLeft` / `ControlRight` hold: skip start/stop
- `KeyF` hold: fast-forward start/stop
- `KeyA`: auto toggle
- `ArrowUp` / `ArrowDown`: transient choice navigation command
- `Escape`: UI cancel command

Default pointer binding maps primary clicks inside `.qua-stage` to `advance`. Clicks on buttons, form controls, links, choices, overlays, settings, backlog, and elements marked with `data-qua-input-ignore` are ignored so UI controls do not accidentally advance the story. Pointer metadata uses `clientPointToStageLogical()` and carries logical `x/y` coordinates.

Default gamepad bindings map `A/Cross` to choice confirm or advance, `B/Circle` to UI cancel, D-pad up/down to choice navigation commands, right bumper hold to fast-forward, right trigger hold to skip, and Start/Menu to UI menu. Gamepad polling is renderer-local and stops when the input controller is disposed.

Use the preset option to customize or disable input:

```ts
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'

const plugins = createVisualNovelWebRendererPlugins({
  input: {
    gamepad: false,
    bindings: [
      { source: 'keyboard', code: 'KeyN', command: 'advance', preventDefault: true },
    ],
  },
})

const pluginsWithoutInput = createVisualNovelWebRendererPlugins({ input: false })
```

## Stage And Background Projection

The native DOM renderer builds the adaptive aspect-interval stage structure internally. Functional positioning for `.qua-renderer`, `.qua-stage-frame`, `.qua-stage-viewport`, and `.qua-stage` does not depend on optional theme CSS.

Stage contents are separated by projection plane:

- `.qua-stage-scene` applies stage/camera motion to full-stage scene content.
- `.qua-stage-scene-content` contains full-bleed background and scene art.
- `.qua-stage-subject` contains foreground subject content such as characters. Default character staging uses the resolved safe-area center, while explicit `x/y` remain logical stage coordinates and explicit percent fields remain percent-based authoring values.
- `.qua-stage-plane` contains full-stage screen effects and transitions that are not camera transformed.
- `.qua-stage-safe` is positioned to `ResolvedStageLayout.safeArea` and contains dialogue, choices, backlog, and UI overlays.

Default landscape layout adapts from 16:10 to 16:9. Default portrait layout uses a 9:19.5 phone reference and adapts from 9:21 to 9:16 so common mobile screens can fill without black bars.

Use `resolveStageLayout`, `clientPointToStageLogical`, `stageLogicalToClientPoint`, and `observeStageViewportEnvironment` for shared layout, pointer coordinate math, and mobile viewport changes. Pipeline payload coordinates should be logical stage coordinates unless a field explicitly names raw browser/client units.

Mobile CSS safe-area insets and `devicePixelRatio` are renderer-local inputs to layout resolution. Safe-area insets are converted from CSS pixels into logical stage pixels and intersected with the aspect safe area. DPR is exposed as physical-pixel metadata for Canvas/WebGL/screenshot paths; it does not change DOM CSS sizing.

Background projection helpers support image, video, and layered backgrounds with shared fit, origin, transform, opacity, blend, filter, and mask semantics. Running background animations are refreshed through transient renderer animation ticks while asset object URLs remain tied to full projection updates.

See `docs/design/mobile-rendering-adaptation.md` and `docs/design/background-composition-animation.md` for the full cross-package design.

## WebAudio Autoplay

`WebAudioRendererController` attempts to unlock audio automatically when the engine-owned audio projection contains a playing BGM, voice, SFX, or ambient track. If the browser allows playback and the `AudioContext` is already running, sources start immediately and `audio/unlocked` is emitted through the pipeline.

Browser autoplay policy blocks are handled as normal Web runtime behavior, not engine audio errors. When autoplay is blocked, sources remain pending and start after the next configured user activation event. The default unlock events are `pointerdown`, `keydown`, `touchstart`, and `mousedown`; pass `autoUnlock: false` or a custom `unlockEvents` list to `createAudioWebRendererPlugin` or `WebAudioRendererController` when needed.
