# @quajs/plugin-fonts

Font face projection plugin for QuaEngine. It lets projects register font assets with engine-owned projection state so Web renderers can load and apply fonts without owning game state.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { FontsPlugin } from '@quajs/plugin-fonts'

const engine = new QuaEngine()

engine.use(new FontsPlugin())
```

Renderer entries:

- `@quajs/renderer-web/plugins/fonts`
- `@quajs/renderer-vue/plugins/fonts`

## Register Fonts

```ts
import {
  getFontsProjection,
  registerFontsWithEngine,
  registerFontWithEngine,
  unregisterFontWithEngine,
} from '@quajs/plugin-fonts'

await registerFontWithEngine(engine, 'Inter', 'fonts/inter.woff2', {
  id: 'inter-regular',
  weight: 400,
  style: 'normal',
  display: 'swap',
})

await registerFontsWithEngine(engine, [
  {
    family: 'Noto Serif JP',
    assetName: 'fonts/noto-serif-jp.woff2',
    weight: 500,
    locale: 'ja-jp',
  },
])

const fonts = getFontsProjection(engine)
await unregisterFontWithEngine(engine, 'inter-regular')
```

## Projection Model

`FontsProjection` contains:

- `revision`
- `requiredRuntimePackages`
- `faces`

Each face includes standard CSS font-face fields such as family, weight, style, stretch, display, unicode range, feature settings, and variation settings.

## Runtime Packages

Font entries can carry `contentPackageId`. Runtime package unload clears font faces that depend on the unloaded package.

## Renderer Boundary

The plugin only projects font definitions. Web renderer packages resolve asset URLs, create browser font faces, and clean them up as transient Web resources.
