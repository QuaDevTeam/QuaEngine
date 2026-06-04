# @quajs/plugin-background

Background projection plugin for QuaEngine. It provides image backgrounds, video backgrounds, layered backgrounds, transitions, CG overlays, and QuaScript decorators.

The plugin writes engine-owned background projection state. Renderer packages project that state through DOM/video/image layers and do not own background state.

See `docs/design/background-composition-animation.md` for the cross-package design.

## Installation

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
- React/Svelte preset wrappers through their renderer packages

## Image And Video Backgrounds

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

await background.clearBackground()
```

## Layered Backgrounds

```ts
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

await background.transitionLayer('fog', {
  type: 'fade-out',
  duration: 300,
})
```

Layer coordinates and animation values use logical stage units unless an option explicitly names another unit.

## CG Overlays

```ts
await background.showCgOverlay('images/cg/unit7-memory.jpg', {
  duration: 500,
  zIndex: 80,
})

await background.hideCgOverlay({ duration: 350 })
```

CG overlays are modeled as projection layers. They can cover character layers or coexist with them depending on z-order.

## Animation Subentry

`@quajs/plugin-background/animation` provides background motion presets that return `@quajs/plugin-animation` timelines.

```ts
import { AnimationPlugin } from '@quajs/plugin-animation'
import {
  kenBurns,
} from '@quajs/plugin-background/animation'

const animation = new AnimationPlugin()
engine.use(animation)
await engine.init()

await animation.playTimeline(kenBurns({
  target: 'background:main',
  duration: 4000,
  to: 1.12,
  x: 40,
}))
```

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-background/script-compiler`.

```qs
@SetBackground('images/bg/station-night.jpg', { transition: { type: 'fade', duration: 400 } })
Narrator: The station returns as a blue outline.

@BackgroundLayer('fog', 'images/fog.png', { opacity: 0.5, zIndex: 20 })
Narrator: Static pools around the platform.
```

Decorators include `@SetBackground`, `@ClearBackground`, `@VideoBackground`, `@SetLayeredBackground`, `@BackgroundLayer`, `@RemoveBackgroundLayer`, `@ClearBackgroundLayers`, `@BackgroundTransition`, and `@BackgroundLayerTransition`.

## Runtime Packages

Background projections preserve package provenance where asset references come from runtime packages. Unloading a runtime package clears background content that depends on the package unless the unload is explicitly forced by engine lifecycle code.
