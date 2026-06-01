# @quajs/plugin-background

Engine-owned background projection APIs and QuaScript decorators.

See the cross-package design: `docs/design/background-composition-animation.md`.

Renderer projection is handled by `@quajs/renderer-web/plugins/background` and thin framework adapter subentries for Vue, React, and Svelte. This package does not own renderer state.

## Runtime API

```ts
await setBackgroundWithEngine(engine, 'room.png', {
  fit: 'cover',
  origin: 'center center',
  transition: { type: 'fade', duration: 300 },
})

await setLayeredBackgroundWithEngine(engine, [{
  id: 'fog',
  assetName: 'fog.png',
  opacity: 0.6,
  zIndex: 20,
  composition: {
    blendMode: 'screen',
    filter: { blur: 4 },
    mask: { assetName: 'fog-mask.png' },
  },
}])
```

## Animation Sub-Entry

`@quajs/plugin-background/animation` provides background motion presets that return `@quajs/plugin-animation` timelines. It does not create a second animation system.

```ts
import { kenBurns, playBackgroundMotionWithEngine } from '@quajs/plugin-background/animation'

await playBackgroundMotionWithEngine(engine, kenBurns({
  target: 'background:main',
  duration: 4000,
  to: 1.12,
  x: 40,
}))
```
