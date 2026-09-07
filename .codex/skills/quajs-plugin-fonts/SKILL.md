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

The native-window OpenType backend consumes loaded QPK TTF/OTF/WOFF/WOFF2 faces and builds transient high-resolution per-frame glyph atlases with proportional metrics. Explicit projected families are selected first and the first active face is the default for text without a family. Native shaping uses `rustybuzz` plus Unicode bidi visual runs to project glyph ids, ligatures, kerning, script-specific clusters, offsets, mixed LTR/RTL text, feature settings, and variation settings into the existing atlas geometry. Native line wrapping uses Unicode UAX #14 break opportunities with an oversized-segment fallback. Each family keeps one texture resource while carrying per-face glyph-id maps; WGPU selects style first, then the nearest weight, and retries another family face when the preferred face lacks a shaped glyph. The atlas keeps the older character map and top-level shaping fields as backward-compatible fallbacks for native backends that do not publish face variants. WGPU applies layout in physical DPR-scaled stage coordinates and samples uploaded font atlases linearly. Projected bold weights receive a small DPR-scaled horizontal mask embolden only when the selected face is lighter than the request. The built-in `5x7` atlas is fallback-only when no usable registered atlas/layout exists or a requested style is not supported by the high-resolution path.

Native dialogue typography resolves `normal` line height from the selected QPK atlas's ascent/descent/line-gap metrics after font loading. Block struts and full span sources must prewarm their own physical-size font buckets, including blocks whose font is not used by any visible span. CSS numeric line-height multipliers remain relative through inheritance; em/% line heights compute to lengths at the declaring element. Backend measurement and glyph drawing share the same inline layout, and the app reflows panel/speaker/choice bounds after font upload using the current borrowed projection. Keep all of these as transient renderer resources; do not persist measured layout or introduce font access outside QPK provenance. Native JSON numbers remain logical lengths, while the TS bridge encodes Web numeric line heights as CSS strings. See `docs/design/native-text-layout.md` for the standards comparison, Parley/COSMIC evaluation, and outstanding paragraph bidi/per-cluster fallback work. Browser comparisons must use standards mode and independently measured content height.

This high-resolution atlas path is not a full browser typography engine: vertical writing, language-specific hyphenation, font synthesis beyond the existing bold approximation, high-resolution text-decoration geometry, and per-cluster cross-face fallback remain separate work. Register faces that cover every required script; a Latin-only Noto Sans file does not provide complete CJK coverage.

The demo registers the OFL `NotoSansCJKsc-Regular.otf` asset under the existing `Noto Sans` family so Latin and Simplified Chinese glyphs share the same QPK-backed Web/native face and the complete native E2E can keep asserting the backward-compatible `fonts:Noto Sans` resource id. Keep the older Latin TTF asset available for compatibility with existing demo asset references.

## Validation

```bash
pnpm --filter @quajs/plugin-fonts test -- --run
pnpm --filter @quajs/plugin-fonts typecheck
pnpm --filter @quajs/plugin-fonts build
pnpm native:e2e
```

Run renderer font tests when projection shape changes.

## Review Checklist

- Are font definitions projected through engine-owned state?
- Are browser/native font handles transient renderer resources?
- Are runtime package font refs package-aware?
- Are style/theme concerns kept out of automatic renderer imports?
- If font API, projection, or renderer behavior changed, was this skill updated?
- Does the complete native E2E prove a QPK atlas upload, shaped high-resolution atlas draws, zero bitmap fallback draws, and the expected `fonts:<family>` resource id?
