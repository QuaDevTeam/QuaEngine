# @quajs/plugin-animation

Cross-plugin timeline animation APIs for engine-owned visual projections. The plugin can animate character, background, layered background, UI, and effect targets without giving the renderer authority over game state.

Renderer packages consume animation projection data and interpolate in logical stage space where the target is coordinate-bearing.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { AnimationPlugin } from '@quajs/plugin-animation'

const engine = new QuaEngine()

engine.use(new AnimationPlugin({
  defaultDuration: 400,
}))
```

If `@quajs/plugin-settings` is installed, animation developer settings can tune default duration/easing behavior.

## Timeline Model

```ts
import { playTimelineWithEngine } from '@quajs/plugin-animation'

await playTimelineWithEngine(engine, {
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

- `background:main`
- `backgroundLayer:<layerId>`
- `character:<id>`
- `ui:<id>`
- `effect:<id>`

Discrete fields such as `fit`, `origin`, and `composition.blendMode` should use `step` or `discrete` interpolation.

## Reusable Animations

```ts
import {
  defineAnimation,
  playAnimationWithEngine,
  registerAnimationWithEngine,
} from '@quajs/plugin-animation'

await registerAnimationWithEngine(engine, defineAnimation({
  id: 'fade-in',
  duration: 300,
  tracks: [{
    target: 'self',
    property: 'opacity',
    keyframes: [{ at: 0, value: 0 }, { at: 300, value: 1 }],
  }],
}))

await playAnimationWithEngine(engine, 'fade-in', {
  bindings: { self: 'character:heroine' },
})
```

## Playback API

```ts
import {
  pauseAnimationWithEngine,
  resumeAnimationWithEngine,
  seekAnimationWithEngine,
  stopAnimationWithEngine,
  waitAnimationWithEngine,
} from '@quajs/plugin-animation'

await pauseAnimationWithEngine(engine, 'fade-in')
await resumeAnimationWithEngine(engine, 'fade-in')
await seekAnimationWithEngine(engine, 'fade-in', 180)
await waitAnimationWithEngine(engine, 'fade-in')
await stopAnimationWithEngine(engine, 'fade-in')
```

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-animation/script-compiler`.

```qs
@AnimationTimeline(600)
@Key('character:unit7', 'opacity', 0, 0)
@Key('character:unit7', 'opacity', 600, 1)
Narrator: Unit-7 steps out of the noise.
```

Decorators include `@DefineAnimation`, `@AnimationTimeline`, `@Key`, and `@PlayAnimation`.

## Background Motion Helpers

`@quajs/plugin-background/animation` provides presets such as `kenBurns()` that return animation timelines. Those helpers still use this animation plugin and do not create a second animation system.

See `docs/design/background-composition-animation.md`.
