---
name: quajs-plugin-fonts
description: Use, document, or modify @quajs/plugin-fonts. Covers engine-owned font face projection, font registration, renderer font loading boundary, runtime package provenance, renderer entries, and validation.
---

# @quajs/plugin-fonts

Use this skill for `packages/plugins/fonts`, font face projection behavior, renderer font entries, typography asset refs, or runtime package font handling.

## Responsibility

`@quajs/plugin-fonts` projects font face definitions through engine-owned state. Web/native renderers load font assets and create transient browser/native font resources.

The plugin does not own visual CSS themes and should not auto-import renderer styling.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { FontsPlugin } from '@quajs/plugin-fonts'

const engine = new QuaEngine()
const fonts = new FontsPlugin()

engine.use(fonts)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/fonts`
- `@quajs/renderer-vue/plugins/fonts`
- `@quajs/renderer-cocos/plugins/fonts`

## Register Fonts

```ts
await fonts.registerFont('Inter', 'fonts/inter.woff2', {
  id: 'inter-regular',
  weight: 400,
  style: 'normal',
  display: 'swap',
})

await fonts.registerFonts([
  {
    family: 'Noto Serif JP',
    assetName: 'fonts/noto-serif-jp.woff2',
    weight: 500,
    locale: 'ja-jp',
  },
])

const projection = fonts.getProjection()
await fonts.unregisterFont('inter-regular')
```

Font face fields mirror CSS font-face concepts such as family, weight, style, stretch, display, unicode range, feature settings, and variation settings.

## Projection Model

`FontsProjection` includes:

- `revision`
- `requiredRuntimePackages`
- `faces`

Each face may carry `contentPackageId` and `requiredRuntimePackages`.

## Runtime Packages

Runtime package font entries must preserve package provenance. Unloading a runtime package clears font faces that depend on the unloaded package.

## Renderer Boundary

Web renderers resolve asset URLs, create browser `FontFace` resources, attach style/runtime resources, and clean them up as transient projection resources. Native renderers consume `view.plugins.fonts`, validate font face asset/provenance data, plan transient font backend commands, and load font bytes only through package-scoped native host/QPK asset reads. Engine/plugin state only says which fonts should exist.

Native font projection and bytes sync do not imply real glyph shaping, bidi, fallback selection, CJK rendering, or font asset rasterization until a native text backend consumes those loaded faces.

## Validation

```bash
pnpm --filter @quajs/plugin-fonts test -- --run
pnpm --filter @quajs/plugin-fonts typecheck
pnpm --filter @quajs/plugin-fonts build
```

Run renderer font tests when projection shape changes.

## Review Checklist

- Are font definitions projected through engine-owned state?
- Are browser/native font handles transient renderer resources?
- Are runtime package font refs package-aware?
- Are style/theme concerns kept out of automatic renderer imports?
- If font API, projection, or renderer behavior changed, was this skill updated?
