---
name: quajs-plugin-background
description: Use, document, or modify @quajs/plugin-background. Covers image/video/layered backgrounds, CG overlays, transitions, logical stage coordinates, animation integration, QuaScript decorators, renderer boundary, runtime package provenance, and validation.
---

# @quajs/plugin-background

Use this skill for `packages/plugins/background`, background projection behavior, background QuaScript decorators, renderer background entries, and background examples.

## Responsibility

`@quajs/plugin-background` writes engine-owned background projection state for image backgrounds, video backgrounds, layered backgrounds, transitions, and CG overlays. Renderers project that state and may hold only transient image/video/object URL/animation resources.

Coordinate-bearing options and animation values use logical stage units unless an API explicitly names another unit.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { BackgroundPlugin } from '@quajs/plugin-background'

const engine = new QuaEngine()
const background = new BackgroundPlugin()

engine.use(background)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/background`
- `@quajs/renderer-vue/plugins/background`
- `@quajs/renderer-cocos/plugins/background`

## Runtime API

```ts
await background.setBackground('images/bg/station-night.jpg', {
  fit: 'cover',
  origin: 'center center',
  transition: { type: 'fade', duration: 400 },
})

await background.setVideoBackground('video/rain-loop.webm', {
  loop: true,
  muted: true,
  fit: 'cover',
})

await background.setLayeredBackground([], {
  fit: 'cover',
  transition: { type: 'crossfade', duration: 500 },
})

await background.addLayer({
  id: 'fog',
  assetName: 'images/fog.png',
  opacity: 0.55,
  zIndex: 20,
  composition: {
    blendMode: 'screen',
    filter: { blur: 4 },
    mask: { assetName: 'images/fog-mask.png' },
  },
})

await background.transitionLayer('fog', { type: 'fade-out', duration: 300 })
await background.showCgOverlay('images/cg/unit7-memory.jpg', { duration: 500, zIndex: 80 })
await background.hideCgOverlay({ duration: 350 })
await background.clearBackground()
```

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-background/script-compiler`.

```qs
@SetBackground('images/bg/station-night.jpg', { transition: { type: 'fade', duration: 400 } })
Narrator: The station returns as a blue outline.

@BackgroundLayer('fog', 'images/fog.png', { opacity: 0.5, zIndex: 20 })
Narrator: Static pools around the platform.

@ShowCgOverlay('images/cg/unit7-memory.jpg', { duration: 500 })
Narrator: The recovered image fills the stage.
```

Decorators:

- `@SetBackground(asset, options?)`
- `@ClearBackground()`
- `@VideoBackground(asset, options?)`
- `@SetLayeredBackground(options?)`
- `@BackgroundLayer(layerId, asset, options?)`
- `@RemoveBackgroundLayer(layerId)`
- `@ClearBackgroundLayers()`
- `@BackgroundTransition(type = 'instant', duration?, easing?)`
- `@BackgroundLayerTransition(layerId, type = 'instant', duration?, easing?)`
- `@ShowCgOverlay(asset, options?)`
- `@HideCgOverlay(options?)`

Transition types commonly include `instant`, `fade`, `crossfade`, and `wipe`; runtime APIs may support additional transition records.

## Animation Integration

`@quajs/plugin-background/animation` returns normal `@quajs/plugin-animation` timelines:

```ts
import { kenBurns } from '@quajs/plugin-background/animation'

await animation.playTimeline(kenBurns({
  target: 'background:main',
  duration: 4000,
  to: 1.12,
  x: 40,
}))
```

Background animation targets include `background:main` and `backgroundLayer:<layerId>`.

## Runtime Packages

Background projections must preserve package provenance for runtime package assets. Unloading a runtime package clears background content that depends on the package unless engine teardown intentionally forces unload.

## Validation

```bash
pnpm --filter @quajs/plugin-background test -- --run
pnpm --filter @quajs/plugin-background typecheck
pnpm --filter @quajs/plugin-background build
```

Run renderer package tests when projection contracts or renderer entries change.

## Review Checklist

- Does background state remain engine-owned?
- Are renderer resources transient only?
- Do options/animations use logical stage units or explicitly named units?
- Do decorators match package-local mappings and compiler lowering?
- Are runtime package asset refs package-aware?
- If background API, decorator, projection, or renderer behavior changed, was this skill updated?
