# @quajs/plugin-animation

Cross-plugin timeline animation APIs for engine-owned projections.

Background motion uses the same timeline system as characters, UI, and effects. Use:

- `background:main` for the whole background.
- `backgroundLayer:<layerId>` for one layered background item.

```ts
await playTimelineWithEngine(engine, {
  duration: 1000,
  tracks: [{
    target: 'background:main',
    property: 'scale',
    keyframes: [{ at: 0, value: 1 }, { at: 1000, value: 1.08 }],
  }, {
    target: 'backgroundLayer:fog',
    property: 'composition.filter.blur',
    keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 6 }],
  }],
})
```

Discrete background fields such as `fit`, `origin`, and `composition.blendMode` should use `step` or `discrete` interpolation.

See `docs/design/background-composition-animation.md` for the full background composition design.
