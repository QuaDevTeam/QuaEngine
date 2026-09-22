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

## Images at arbitrary stage positions

```ts
await background.setBackground('backgrounds/room.webp')
await background.addLayer({
  id: 'letter', assetName: 'inserts/letter.png',
  x: 320, y: 180, width: 480, height: 320,
  fit: 'contain', rotation: -6, opacity: 0.9, zIndex: 10,
})
await background.updateLayer('letter', { x: 700 })
await background.removeLayer('letter')
```

Coordinates and dimensions are logical stage units, measured from the top-left (1920 × 1080 for landscape). Multiple ids add multiple images; reusing an id replaces that image. These images belong to the background composition, behind characters; `zIndex` orders that composition. Adding or clearing layers preserves the original image/video background. `clearBackground()` removes everything. Scene images remain visible in screenshot mode.

QuaScript uses the same options:

```qs
@BackgroundLayer('letter', 'inserts/letter.png', { x: 320, y: 180, width: 480, height: 320, fit: 'contain', zIndex: 10 })
Narrator: A letter rests on the desk.

@RemoveBackgroundLayer('letter')
Narrator: She puts it away.
```

## Animate placed images

Register `AnimationPlugin` from `@quajs/plugin-animation` before `engine.init()`. Each placed image is an animation target named `backgroundLayer:<id>`:

```ts
import { createBackgroundMotionTimeline } from '@quajs/plugin-background/animation'

await background.addLayer({
  id: 'letter', assetName: 'inserts/letter.png',
  x: 320, y: 180, width: 480, height: 320, fit: 'contain',
})
const playback = await animation.playTimeline(createBackgroundMotionTimeline('backgroundLayer:letter', [
  { at: 0, x: 320, y: 180, width: 480, height: 320, scale: 1, rotation: -6, opacity: 0 },
  { at: 800, x: 700, y: 260, width: 600, height: 400, scale: 1.1, rotation: 0, opacity: 1, easing: 'easeOutCubic' },
], { duration: 800 }))
await animation.wait(playback.id)
```

Position and numeric dimensions use logical stage units; rotation is in degrees and opacity is 0–1. The ordinary animation controls apply: `pause`, `resume`, `seek`, `stop`, playback rate and loops. Named timelines can bind `self` to `backgroundLayer:letter`. The default `commit: 'final'` writes completed values into engine state, preserving the base background and other layers. Use `{ wait: true }` as the second `playTimeline` argument to wait inline, or leave it unset to continue dialogue during playback. Screenshot mode hides UI while these scene animations keep playing.

QuaScript with background and animation decorators enabled:

```qs
@BackgroundLayer('letter', 'inserts/letter.png', { x: 320, y: 180, width: 480, height: 320, fit: 'contain', opacity: 0 })

@AnimationTimeline(800, true)
@Key('backgroundLayer:letter', 'x', 0, 320)
@Key('backgroundLayer:letter', 'x', 800, 700, 'easeOutCubic')
@Key('backgroundLayer:letter', 'opacity', 0, 0)
@Key('backgroundLayer:letter', 'opacity', 800, 1)
Narrator: The letter slides into view.
```

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

## Default and custom background transitions

Replacing a picture defaults to a 300 ms crossfade after the incoming assets are ready. The old picture remains visible during preparation. Use `transition: { type: 'instant' }` for an immediate replacement, or import `defineBackgroundTransition` to author reusable incoming/outgoing keyframes and custom GLSL/WGSL shaders. QuaScript accepts the same definitions and shader parameters through `@SetBackground(asset, { transition })`.

See [Background transitions](../../../docs/design/background-transitions.md) for numeric properties, shader sampling/uniforms, cancellation, runtime package ownership, and validation.
