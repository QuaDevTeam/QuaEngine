# @quajs/plugin-sprite

Sprite tooling package for QuaEngine. It provides sprite manifest contracts, expression diff resolution helpers, UI skin manifests, Quack asset generation integration, and Vite dev HMR helpers.

This package is a feature/build package rather than an engine state plugin. Character projection state belongs to engine/character APIs; Web renderer packages resolve sprite manifests as transient projection resources.

## Entries

| Entry                            | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `@quajs/plugin-sprite`           | Contracts and helper exports                              |
| `@quajs/plugin-sprite/contracts` | Sprite manifest, expression, atlas, and UI skin contracts |
| `@quajs/plugin-sprite/build`     | Quack plugin for derived sprite asset generation          |
| `@quajs/plugin-sprite/vite`      | Vite plugin for dev VFS synthetic sprite assets and HMR   |

Renderer entries:

- `@quajs/renderer-web/plugins/sprite`
- `@quajs/renderer-vue/plugins/sprite`

## Sprite Layout

Character sprite assets usually live under `assets/characters`.

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
    "neutral": {
      "layers": []
    },
    "alert": {
      "layers": [
        { "asset": "unit7/expressions/alert.png", "zIndex": 10 }
      ]
    }
  }
}
```

Expression layers can specify offsets, z-index, opacity, masks, blend mode, anchors, scale, rotation, visibility, fallback assets, and atlas frames.

## UI Skins

UI skins live under `assets/ui` and can define sliced/tiled image assets for buttons, panels, and controls.

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

Sprite manifests are asset metadata. They do not create authoritative character state. Character visibility, position, expression selection, and transitions are engine-owned projections consumed by renderer sprite components.
