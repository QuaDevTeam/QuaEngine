---
name: quajs-plugin-sprite
description: Use, document, or modify @quajs/plugin-sprite. Covers sprite manifests, expression diff resolution, UI skin manifests, Quack build integration, Vite dev VFS/HMR, renderer sprite boundary, runtime package asset provenance, and validation.
---

# @quajs/plugin-sprite

Use this skill for `packages/plugins/sprite`, sprite manifests, expression diffs, UI skins, Quack sprite asset generation, Vite sprite dev integration, or renderer sprite entries.

## Responsibility

`@quajs/plugin-sprite` is a feature/build package, not an engine state plugin. It provides sprite manifest contracts, expression diff resolution helpers, UI skin manifests, Quack asset generation integration, and Vite dev HMR helpers.

Character visibility, position, expression selection, and transitions remain engine-owned through `@quajs/character`. Renderer sprite plugins resolve manifests as transient projection resources.

Renderer entries:

- `@quajs/renderer-web/plugins/sprite`
- `@quajs/renderer-vue/plugins/sprite`
- `@quajs/renderer-cocos/plugins/sprite`

## Package Entries

- `@quajs/plugin-sprite`: contracts and helper exports.
- `@quajs/plugin-sprite/contracts`: sprite manifest, expression, atlas, and UI skin contracts.
- `@quajs/plugin-sprite/build`: Quack plugin for derived sprite asset generation.
- `@quajs/plugin-sprite/vite`: Vite plugin for dev VFS synthetic sprite assets and HMR.

## Sprite Layout

Typical character sprite assets live under `assets/characters`:

```text
assets/characters/unit7/
  base.png
  expressions/
    neutral.png
    alert.png
  sprite.manifest.json
```

Minimal manifest:

```json
{
  "version": 1,
  "family": "unit7",
  "base": { "asset": "unit7/base.png" },
  "expressions": {
    "neutral": { "layers": [] },
    "alert": {
      "layers": [
        { "asset": "unit7/expressions/alert.png", "zIndex": 10 }
      ]
    }
  }
}
```

Expression layers may specify offsets, z-index, opacity, masks, blend mode, anchors, scale, rotation, visibility, fallback assets, and atlas frames.

## UI Skins

UI skins live under `assets/ui` and can define sliced/tiled image assets:

```json
{
  "version": 1,
  "family": "demo",
  "skins": {
    "button": {
      "base": { "asset": "ui/button.png" },
      "slice": { "top": 12, "right": 12, "bottom": 12, "left": 12 },
      "states": {
        "hover": { "asset": "ui/button-hover.png" },
        "disabled": { "asset": "ui/button-disabled.png", "opacity": 0.5 }
      }
    }
  }
}
```

## Quack Integration

```ts
import { createSpriteQuackPlugin } from '@quajs/plugin-sprite/build'

export default {
  plugins: [
    createSpriteQuackPlugin({
      generateMissingManifests: true,
    }),
  ],
}
```

The Quack plugin can generate derived sprite assets and missing manifests during asset collection.

## Vite Integration

```ts
import { createSpriteVitePlugin } from '@quajs/plugin-sprite/vite'

export default {
  plugins: [
    createSpriteVitePlugin({
      source: 'assets',
      devVfsBase: '/@qua-assets',
    }),
  ],
}
```

The Vite plugin adds synthetic sprite records to the dev VFS manifest and emits `qua-assets:update` HMR events when derived sprite assets change.

## Runtime Boundary

Sprite manifests are asset metadata. They must not create authoritative character state or renderer caches required for save/load/replay. Runtime package sprite/UI skin assets must preserve `contentPackageId` and `requiredRuntimePackages`.

Native accepts resolved `metadata.spriteBase` / `metadata.spriteLayers` and the product app resolves version-1 family manifests or explicit JSON sprite references through mounted QPKs. It selects the engine-owned expression, normalizes family paths, applies atlas-frame metadata overrides and uses declared fallback assets when primary assets are missing. Preserve provenance and package candidate priority; cache metadata only, including misses, and clear it on mount/version/hash change, lifecycle tick and teardown. Do not duplicate character/profile state or add loose-resource loading.

Rust projects decoded-texel atlas crops, parent/local offset/scale/rotation, local mask/blend and subtree opacity. Negative uniform character scale means Web `scale(...)` (both axes), and finite bounded layer scales support zero (collapsed) and negative values. Never show a complete atlas for an invalid/unresolved frame. Isolated crops and border slices use clamped base-mip sampling to avoid adjacent-image bleeding. Multiple layers share a character stacking context, and parent opacity/presence applies once after local composition.

QSS border-image now draws numeric source-texel slices with logical destination widths, stretch/repeat and optional fill. This does not load UI skin manifests automatically. Mixed natural-size/trimmed-frame canvas layout remains incomplete. Native `spriteLayer:*` timelines support offsetX/offsetY/scale/rotation/opacity/integral zIndex/visible/blendMode. The existing Rust clock samples before QPK resolution and late draw projection applies values to base index 0 and expression indices starting at 1. Alias priority is kind:index, kind, index; later alias groups win. Resource fields are excluded. Use `commit: 'none'`; no built-in spriteLayer commit adapter exists, and strict adapter checking needs an application adapter. Validate animation timing and drawing through `node scripts/native-render-audit/sprite-animation.mjs`. Validate resolved composition/masks with `node scripts/native-render-audit/sprite.mjs` and explicit-size manifest/atlas/parent-transform/nine-slice cases with `node scripts/native-render-audit/features.mjs`; both use actual Metal/Chrome and identical Quack QPK bytes.

## Validation

```bash
pnpm --filter @quajs/plugin-sprite test -- --run
pnpm --filter @quajs/plugin-sprite typecheck
pnpm --filter @quajs/plugin-sprite build
```

Run Quack and Vite plugin tests when build/dev integration changes.

## Review Checklist

- Is sprite state still asset metadata, not game progression state?
- Does character expression selection remain engine-owned through character projection?
- Are generated assets and manifests package-aware?
- Is Vite dev VFS/HMR using the existing QuaAssets flow?
- If sprite manifest, Quack/Vite integration, or renderer sprite behavior changed, was this skill updated?
