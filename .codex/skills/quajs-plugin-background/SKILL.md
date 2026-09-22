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

## Positioned scene images

Use `addLayer({ id, assetName, x, y, width, height, fit: 'contain', zIndex, opacity, rotation })` or `@BackgroundLayer(id, asset, options)` for arbitrary images in the scene's background composition. Coordinates and numeric dimensions are logical stage units (landscape: 1920 x 1080). Layers render behind characters; `zIndex` orders images within that composition. Use unique ids to add multiple images; the same id replaces one layer, `updateLayer` moves/changes it, and `removeLayer` removes it.

Adding layers to an image/video background retains its `assetName`/`video` as the base of the layered projection. `clearLayers` clears authored layers and keeps that base; `clearBackground` clears both. Renderers use `resolveBackgroundLayers` from render-core to include the base exactly once, below authored images, with package provenance. Video layer options are detached in snapshots and consumed by Web/Vue; this does not extend Native/Cocos video decoder capabilities. Screenshot mode keeps these scene images visible.

```ts
await background.addLayer({
  id: 'letter', assetName: 'inserts/letter.png',
  x: 320, y: 180, width: 480, height: 320,
  fit: 'contain', rotation: -6, zIndex: 10,
})
await background.updateLayer('letter', { x: 700, opacity: 0.8 })
await background.removeLayer('letter')
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

Replacement defaults to a 300 ms two-layer crossfade. First backgrounds and `{ type: 'instant' }` still wait for renderer resource readiness but skip animation. Use `defineBackgroundTransition` for reusable `incoming`/`outgoing` normalized numeric keyframes or `shader: { glsl, wgsl, params }`. `@SetBackground(asset, { transition: definition })` references imported definitions; `@BackgroundTransition(definition)` also accepts the object form. Sources define `transition(uv)` using `sampleFrom`, `sampleTo`, `progress`, and a vec4 `params`. Web requires WebGL 2; native uses wgpu. Invalid sources keep the old picture and reject preparation. Numeric tracks and shader mode are alternatives.

Read `docs/design/background-transitions.md` for the exact authoring contract and examples. `background/prepare` and `background/ready` are pipeline events, not a second bridge. Engine-owned `preparationId`, `transitionTarget`, shader progress and normal animation projections govern the lifecycle; renderers only retain decoded media, URLs, GPU programs/textures and handles. Cancellation must prevent late completion after clear, supersession, jump/load or forced package eviction. Restore an in-flight saved transition to its stored destination in background plugin jump hooks. Keep outgoing and incoming QPK provenance until completion.

Interactive native decode, premultiplication, mipmaps and GPU writes run on one bounded worker (four jobs, 64 MiB encoded queue); cancelled generations cannot repopulate the cache. Native shader compilation has one in-flight job and one cached definition. Web pins existing `WebAssetUrlHandle` resources through preparation. A failed/unsupported shader is an error rather than an implicit fade. Vue calls the shared Web preparation/canvas implementation; React/Svelte inherit the Web plugin. Existing native video capabilities are not expanded by this API.

Replacement timelines use `commit: 'none'` and `fill: 'none'`: the owning background plugin installs the settled destination. Retained forwards samples must not recreate `shaderTransition.progress` after its shader and temporary layers have been removed. Check the sampled final projection as well as the stored background in regression tests.

Validate with the background/animation/core/Web/Vue/native bridge tests, native image-worker/shader tests and `node scripts/native-render-audit/background-transitions.mjs` (real Chrome plus native GPU captures). Check 0/0.5/1 progress, delayed decode, compile failure, stale readiness, clear, supersession and unload. Full Demo E2E is a separate regression gate.

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

Placed images use that same layer target; do not create a renderer-local animation API. `createBackgroundMotionTimeline('backgroundLayer:letter', [{ at: 0, x: 320, width: 480, opacity: 0 }, { at: 800, x: 700, width: 600, opacity: 1 }], { duration: 800 })` supports numeric `x`, `y`, `width`, `height`, `scale`, `rotation`, `opacity` and filter tracks. Position/dimensions are logical stage units and rotation is degrees. Register `AnimationPlugin` before engine initialization; play through its ordinary timeline API, with pause/resume/seek/wait/loop controls and `self` bindings for reusable definitions. Default final commit preserves the base asset, other layers and runtime provenance. Screenshot mode hides UI without pausing scene animation. Nested layer `video` options must be detached before sampled/committed property writes.

The corresponding QuaScript target is `@Key('backgroundLayer:letter', 'x', 800, 700)`, grouped under `@AnimationTimeline(800, true)`; layer positions use `x`/`y`, unlike character `position.x`/`position.y`. Add the layer before playback. See the package README for complete TypeScript and QuaScript examples. Regression coverage should sample a positioned image mid-timeline, pause/seek/resume, verify settled engine state and preserve sibling/base images; browser smoke also covers playback with hidden UI.

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

## Native image preparation hints

The background decorator compiler attaches advisory static `images` hints for literal `SetBackground`, `BackgroundLayer`, and `ShowCG` assets. It leaves dynamic expressions inside the actual step. The generic compiler preserves these in step metadata, and the engine publishes bounded upcoming windows via `assets/preload`; native prepares QPK images off-thread and reuses resident textures. Hints neither execute a transition nor change the background projection.
