---
name: quajs-plugin-animation
description: Use, document, or modify @quajs/plugin-animation. Covers timeline animation APIs, reusable animations, targets, keyframes, interpolation, QuaScript animation decorators, logical stage coordinate rules, settings, and validation.
---

# @quajs/plugin-animation

Use this skill for `packages/plugins/animation`, animation decorators, cross-plugin motion helpers, or renderer animation projection work.

## Responsibility

`@quajs/plugin-animation` provides engine-owned visual animation projection and reusable timeline APIs. Renderers interpolate/project transiently; they must not become authoritative owners of visual state.

Coordinate-bearing animation values use logical stage coordinates before renderer scaling.

For native rendering, fixed-time `@quajs/engine-native` serialization can resolve `view.animations` through shared render-core helpers using the supplied `now`. The live Rust app sets `projectAnimations:false` and advances renderer-local interpolation from engine-owned timelines; never apply both paths to one frame. Preserve settled dialogue/choice plugin motion even when no timeline is active. Rust keeps redraws alive during delays and accounts for playbackRate, loop, direction, pause and fill (default forwards), in logical stage coordinates.

Native drawing consumes character position/opacity, stage/camera subtree motion, dialogue/choice-panel/individual-choice/UI-overlay x/y/scale/rotation/opacity, and rich-text typography targets. Whole-group transforms must include inverse hit tests and hover variants. Rich-text targets follow shared render-core ids: `richText:<prefix>`, `richTextBlock:<prefix>:<id-or-index>` and `richTextSpan:<prefix>:<id-or-index>`; span targets do not include a block segment. Native typography tracks update both revealed text and full-layout text. Numeric font-weight interpolation is rounded to the native integral OpenType weight range. Per-span affine transforms and general audioBus/audioTrack timeline targets remain incomplete; existing native audio automation is a separate projection path. Test supported target/property pairs through actual draw output, not only JSON mutation.

## Sprite Layer Timelines

Web and Native project `spriteLayer:<characterId>:<kind>:<index>`, `spriteLayer:<characterId>:<kind>`, and `spriteLayer:<characterId>:<index>`. Kind is `base` or `expression`, base index is 0 and expressions start at 1; atlas frames retain their kind. Apply those three alias groups in that order, with the numeric alias taking precedence, regardless of track order between aliases. Character ids may contain colons.

Native supports `offsetX`, `offsetY`, `scale`, `rotation`, `opacity`, integral `zIndex`, `visible`, and `blendMode`; zero/negative uniform scale can be interpolated. Resource mutations (`asset`, `mask`, `frame`) are excluded. Rust samples on its existing frame clock before QPK resolution and applies bounded transient values after the manifest is resolved. Engine state and manifest metadata remain unchanged.

Use `commit: 'none'` and explicit `fill` for layer effects. There is no built-in spriteLayer target adapter for committing final values on either target: default non-strict adapter checking warns while publishing the timeline, and `strictAdapters: true` needs an application-provided adapter. Do not advertise default `commit: 'final'` or decorator-only final-state persistence as supported. `fill: 'forwards'`/`'both'` with `commit: 'none'` retains the engine-owned filled projection at completion.

Native timeline `ease-in`, `ease-out`, and `ease-in-out` match render-core's quadratic curves; CSS interaction transitions retain CSS cubic-bezier semantics. `node scripts/native-render-audit/sprite-animation.mjs` checks actual Web updates against Rust clock → mounted QPK manifest → Metal, including delay, pause, playback rate and alternate loops. This fixed-canvas audit does not prove mixed intrinsic/trimmed sprite layout parity.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { AnimationPlugin } from '@quajs/plugin-animation'

const engine = new QuaEngine()
const animation = new AnimationPlugin()

engine.use(animation)
await engine.init()
```

When `@quajs/plugin-settings` is present, animation may register developer settings for default duration/easing behavior.

## Timeline API

```ts
await animation.playTimeline({
  id: 'bg-push',
  duration: 1200,
  tracks: [
    {
      target: 'background:main',
      property: 'scale',
      keyframes: [
        { at: 0, value: 1 },
        { at: 1200, value: 1.08, easing: 'easeOutCubic' },
      ],
    },
    {
      target: 'character:unit7',
      property: 'opacity',
      keyframes: [
        { at: 0, value: 0 },
        { at: 300, value: 1 },
      ],
    },
  ],
})
```

Common targets:

- `self`
- `background:main`
- `backgroundLayer:<layerId>`
- `character:<id>`
- `ui:<id>`
- `effect:<id>`
- audio targets provided by `@quajs/plugin-audio/animation`, such as `audioBus:*` and `audioTrack:*`

Use `step` or discrete interpolation for non-continuous fields such as `fit`, `origin`, and `composition.blendMode`.

Developer-facing animation timing functions accept common CSS-style names and QuaEngine aliases, including `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `quad-in/out/in-out`, `cubic-in/out/in-out`, camelCase aliases such as `easeOutCubic`, and `cubic-bezier(...)`. Use the same timing function strings in timeline keyframes, scene/background/audio/character motion helpers, and renderer character transition options.

## Placed Scene Images

Images added by `BackgroundPlugin.addLayer` or `@BackgroundLayer` animate through `backgroundLayer:<id>`. Use layer properties `x`, `y`, `width`, `height`, `scale`, `rotation`, `opacity` (not character `position.x`/`position.y`). Numeric position/dimensions use logical stage units, rotation is degrees, and opacity is 0–1. The background `/animation` helper `createBackgroundMotionTimeline` builds these ordinary tracks. Add the layer before playback, then use existing pause/resume/seek/wait/loop controls. Reusable definitions can bind `self=backgroundLayer:letter`.

```qs
@AnimationTimeline(800, true)
@Key('backgroundLayer:letter', 'x', 0, 320)
@Key('backgroundLayer:letter', 'x', 800, 700, 'easeOutCubic')
@Key('backgroundLayer:letter', 'opacity', 0, 0)
@Key('backgroundLayer:letter', 'opacity', 800, 1)
```

The built-in background-layer adapter supports default final commit: completed values persist in engine-owned background state while keeping the retained base image, sibling layers and package provenance. Projection and commits must clone nested layer video options. Screenshot mode leaves scene timelines running while hiding UI. Verify intermediate samples, pause/resume and settled values; `demo/scripts/scene-screenshot-smoke.mjs` exercises actual browser image playback with hidden UI. Native frame tests cover fixed-time samples and unchanged live Rust timeline handoff; they do not establish GPU parity.

## Reusable Animations

The editor's built-in **动画** panel (`@quajs/editor-animation`) authors ordinary `AnimationTimeline` JSON in `*.animation.json`. Import the file, register it through `AnimationPlugin.registerAnimation`, and bind `self` on playback. The current visual subset is numeric character position/scale/rotation/opacity with absolute ms keyframes; the panel uses the actual Web renderer for isolated character preview or the project Web scene. Literal QuaScript `@PlayAnimation` calls provide automatic scene association; users can also choose a scene/step and hide its dialogue. Scene scrubbing publishes a temporary engine-owned paused projection with `commit: none` through the development preview pipeline and releases it on exit. It does not automatically register definitions or change production bootstrap. See `qua-editor-animation` for source/lifecycle constraints and real Electron validation.

```ts
import { defineAnimation } from '@quajs/plugin-animation'

await animation.registerAnimation(defineAnimation({
  id: 'fade-in',
  duration: 300,
  tracks: [{
    target: 'self',
    property: 'opacity',
    keyframes: [{ at: 0, value: 0 }, { at: 300, value: 1 }],
  }],
}))

await animation.playAnimation('fade-in', {
  bindings: { self: 'character:heroine' },
})
```

Playback helpers include `pause`, `resume`, `seek`, `wait`, and `stop`.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-animation/script-compiler`.

```qs
@AnimationTimeline(600, true)
@Key('character:unit7', 'opacity', 0, 0)
@Key('character:unit7', 'opacity', 600, 1, 'easeOutCubic')
Narrator: Unit-7 steps out of the noise.

@AnimationTimeline(300, true)
@Key('opacity', 0, 0)
@Key('opacity', 300, 1)
Unit-7: I am here.
```

Decorators:

- `@AnimationTimeline(duration, wait?)`: plays an inline timeline. A trailing boolean is treated as `wait`.
- `@DefineAnimation(animationId, duration)`: registers a reusable timeline from following `@Key` decorators.
- `@Key(target, property, at, value, easing?)`: explicit target keyframe.
- `@Key(property, at, value, easing?)`: allowed on dialogue when `self` can resolve to the speaking character.
- `@PlayAnimation(animationId, ...bindings, wait?)`: plays a reusable animation. String bindings are passed through; trailing boolean is `wait`.

`@Key` must follow `@AnimationTimeline` or `@DefineAnimation`.

## Validation

```bash
pnpm --filter @quajs/plugin-animation test -- --run
pnpm --filter @quajs/plugin-animation typecheck
pnpm --filter @quajs/plugin-animation build
```

Run affected feature plugin tests when their animation adapters are changed.

## Review Checklist

- Are target/property names explicit and collision-resistant?
- Do coordinate-bearing tracks use logical stage coordinates?
- Is renderer interpolation transient and projection-only?
- Do `@Key` decorators have an owning timeline/definition?
- If animation API, decorator, target, or projection behavior changed, was this skill updated?
