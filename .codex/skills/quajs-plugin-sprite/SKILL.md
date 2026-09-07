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

Native currently consumes resolved `metadata.spriteLayers` as a limited image-layer projection. Character opacity and transient presence fades apply once to the complete base/expression subtree; layer opacity applies locally, and layer z-index remains inside the character stacking context. The native JSON boundary validates the supported asset and numeric fields, with positive scale required. Native Rust DTO defaults match JSON defaults so omitted visibility/opacity/scale fields do not hide layers. Validate this subset with `node scripts/native-render-audit/sprite.mjs` (real Metal/Chrome and the same Quack QPK bytes). Native manifest/expression resolution, atlas frames, parent transforms, per-layer mask/blend and UI skin loading remain separate unfinished work.

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
