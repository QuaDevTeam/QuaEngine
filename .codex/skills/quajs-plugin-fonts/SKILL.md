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

The native-window TTF/OTF backend consumes loaded QPK faces and builds transient high-resolution per-frame glyph atlases with proportional metrics. Explicit projected families are selected first and the first active face is the default for text without a family. WGPU applies layout in physical DPR-scaled stage coordinates and samples uploaded font atlases linearly. Projected weights at 500 and above receive a small DPR-scaled horizontal mask embolden when the selected atlas does not expose a distinct weight texture, so regular-only demo faces do not silently flatten every heading to regular weight. A real projected bold face remains preferred. The built-in `5x7` atlas is fallback-only when no usable projected atlas exists or the requested style is unsupported.

This high-resolution atlas path is not full Web typography parity: it does not yet provide shaping, bidi, ligatures, variable-font axes, WOFF/WOFF2 decoding, or advanced CJK line breaking. Register faces that cover every required script; a Latin-only Noto Sans file does not provide complete CJK coverage.

The demo registers the OFL `NotoSansCJKsc-Regular.otf` asset under the existing `Noto Sans` family so Latin and Simplified Chinese glyphs share the same QPK-backed Web/native face and native smoke can keep asserting the backward-compatible `fonts:Noto Sans` resource id. Keep the older Latin TTF asset available for compatibility with existing demo asset references.

## Validation

```bash
pnpm --filter @quajs/plugin-fonts test -- --run
pnpm --filter @quajs/plugin-fonts typecheck
pnpm --filter @quajs/plugin-fonts build
pnpm -C demo native:smoke:save-preview
```

Run renderer font tests when projection shape changes.

## Review Checklist

- Are font definitions projected through engine-owned state?
- Are browser/native font handles transient renderer resources?
- Are runtime package font refs package-aware?
- Are style/theme concerns kept out of automatic renderer imports?
- If font API, projection, or renderer behavior changed, was this skill updated?
- Does native smoke prove a QPK atlas upload, high-resolution atlas draws, zero bitmap fallback draws, and the expected `fonts:<family>` resource id?
