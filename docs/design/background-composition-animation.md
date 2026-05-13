# Background Composition And Animation

This design defines how QuaEngine renders adaptive aspect-interval stages and multi-layer backgrounds.

## Ownership

- Engine view projection owns layout and background state.
- `@quajs/plugin-background` writes background projection state through engine APIs.
- `@quajs/plugin-animation` owns timeline playback and active animation projection.
- Renderers read projected state and active animations, then draw. They may keep DOM refs, object URL handles, `ResizeObserver`, and `requestAnimationFrame` handles only as transient implementation state.

## Adaptive Stage

`view.layout` is the authoritative stage layout. `layout.aspectRatio` is the preferred reference ratio, while `layout.minAspectRatio` and `layout.maxAspectRatio` define the supported aspect interval. Renderers clamp the host container ratio into that interval, fit the active ratio into the container, center the viewport only when the device is outside the interval, and scale the logical stage content from top-left.

Default presets:

- `landscape`: 1920x1080 reference at 16:9, adaptive from 16:10 to 16:9.
- `portrait`: 1080x2340 reference at 9:19.5, adaptive from 9:21 to 9:16 for common phone screens.

The base logical height is `layout.height`. The active logical width is resolved from the active aspect ratio, so landscape authors should keep critical UI inside the 16:10 safe area and let backgrounds/effects bleed to 16:9. Portrait authors should keep critical UI inside the tall-phone safe area while allowing background art and camera motion to fill wider phones.

The renderer exposes layout CSS variables such as `--qua-layout-width`, `--qua-layout-height`, and safe-area variables for theme authors. Structural positioning is built into official renderers and does not depend on optional theme styles. Official Web renderers keep full-bleed backgrounds in `.qua-stage-scene-content`, camera-transformed foreground subjects in `.qua-stage-subject`, full-screen effects in `.qua-stage-plane`, and readable/interactable UI in `.qua-stage-safe`. See `docs/design/mobile-rendering-adaptation.md` for the complete cross-device coordinate and mobile adaptation standard.

## Background Projection

Single image, video, and layered backgrounds share the same projection language:

- `fit`: CSS object-fit behavior.
- `origin`: transform origin.
- `width` / `height`: logical px when numeric, raw CSS length when string.
- `x` / `y` / `scale` / `rotation` / `opacity`: stage logical-space transform.
- `composition.blendMode`: CSS `mix-blend-mode`.
- `composition.filter`: CSS filter projection.
- `composition.mask`: CSS mask projection resolved through the asset runtime when an asset name is present.

Layered backgrounds default each layer to a full-stage box. Image and video layers use the same sizing and transform behavior.

## Animation Targets

Background motion is expressed through `@quajs/plugin-animation` only:

- `background:main`: the whole background projection.
- `backgroundLayer:<layerId>`: one background layer.

Common numeric paths:

- `x`
- `y`
- `scale`
- `rotation`
- `opacity`
- `composition.filter.blur`
- `composition.filter.brightness`
- `composition.filter.contrast`
- `composition.filter.saturate`
- `composition.filter.hueRotate`
- `composition.filter.grayscale`
- `composition.filter.sepia`

Discrete paths such as `fit`, `origin`, `composition.blendMode`, and `composition.mask.*` should use `step` or `discrete` interpolation.

## Authoring Examples

```ts
await setLayeredBackgroundWithEngine(engine, [{
  id: 'sky',
  assetName: 'sky.png',
  fit: 'cover',
  zIndex: 0,
}, {
  id: 'fog',
  assetName: 'fog.png',
  zIndex: 10,
  opacity: 0.6,
  composition: {
    blendMode: 'screen',
    filter: { blur: 4 },
    mask: { assetName: 'fog-mask.png', mode: 'alpha' },
  },
}])
```

```ts
await playTimelineWithEngine(engine, {
  duration: 3000,
  tracks: [{
    target: 'background:main',
    property: 'scale',
    keyframes: [{ at: 0, value: 1 }, { at: 3000, value: 1.12 }],
  }, {
    target: 'backgroundLayer:fog',
    property: 'x',
    keyframes: [{ at: 0, value: 0 }, { at: 3000, value: 80 }],
  }],
})
```

QuaScript decorators use object options:

```ts
@SetBackground('room.png', { fit: 'cover', origin: 'center center' })
@BackgroundLayer('fog', 'fog.png', {
  zIndex: 20,
  opacity: 0.6,
  composition: { blendMode: 'screen', filter: { blur: 4 } }
})
```
