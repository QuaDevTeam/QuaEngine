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

Transition and animation `easing` values use QuaEngine timing function strings such as `easeOutCubic`, `cubic-out`, `ease-in-out`, or `cubic-bezier(...)`.

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

## Native projection support

Raster masks use QPK assets and share Web's cover / center / no-repeat defaults. Native supports alpha, luminance (including texture alpha), and raster match-source; contain/auto/px/percent sizes; keyword/px/percent positions and four-part pixel edge offsets; no-repeat/repeat/repeat-x/repeat-y/round/space and two-axis repeat values. Layered root and child masks compose independently and release with renderer resources. Unsupported CSS layout expressions produce native JSON diagnostics. An unresolved mask asset keeps the source visible, matching the Web renderer's absent URL behavior, and retains upload diagnostics. SVG masks, multiple masks, full layered-root transforms and MP4/WebM decoding remain incomplete. Validate rendered output with `node scripts/native-render-audit/background.mjs`; command projection tests do not establish visual parity.

Native source-alpha drop shadows consume `filter.dropShadow: '12px 18px 24px rgba(0, 0, 0, 0.55)'` without a `drop-shadow()` wrapper. Two px offsets are required; blur sigma and a native hex/rgb/rgba/basic named color are optional. Shadow alpha comes from the rendered subtree, preserving transparent holes and overlapping layers. Group opacity/mask/blend apply to the resulting source plus shadow. Unsupported colors/units, unresolved currentColor, negative blur, spread and multiple shadows produce JSON diagnostics. Large-radius Gaussian sampling remains approximate; validate specific artwork against Web when fine blur detail matters.

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


## Authored environment lighting

`ViewBackgroundProjection.characterLighting` is optional engine-owned presentation data set through background options/QS. It has sRGB `ambient` RGB multipliers and an optional `shade` with RGB `color` and normalized sprite-box `from/to` coordinates. The background plugin deep-copies it, carries destination lighting during replacement transitions and removes it for unlit/cleared backgrounds; engine snapshots must deep-copy nested vectors. It is authored content, not an inferred renderer policy or player preference.

Web's character subentry owns SVG matrix/gradient rendering and masks the final composed character once with SourceAlpha. Vue only converts shared descriptors to VNodes; DOM React/Svelte reuse Web. Identity profiles create no filter. Do not add duplicate PNG/Canvas caches, alpha-derived fake normals, scene-filename heuristics or another event bus. Source images keep normal QuaAssets ownership. GPU intermediate surfaces are real overhead outside URL budgets. Native/Cocos currently retain original sprite colors; do not claim parity. Validate transition reset, detached snapshots, real browser alpha edges and current-version save/load. See `demo/.agents/environment-lighting.md` and `demo/scripts/lighting-pixels.mjs`.
