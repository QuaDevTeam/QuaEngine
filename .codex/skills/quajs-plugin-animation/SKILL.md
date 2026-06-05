---
name: quajs-plugin-animation
description: Use, document, or modify @quajs/plugin-animation. Covers timeline animation APIs, reusable animations, targets, keyframes, interpolation, QuaScript animation decorators, logical stage coordinate rules, settings, and validation.
---

# @quajs/plugin-animation

Use this skill for `packages/plugins/animation`, animation decorators, cross-plugin motion helpers, or renderer animation projection work.

## Responsibility

`@quajs/plugin-animation` provides engine-owned visual animation projection and reusable timeline APIs. Renderers interpolate/project transiently; they must not become authoritative owners of visual state.

Coordinate-bearing animation values use logical stage coordinates before renderer scaling.

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

## Reusable Animations

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
