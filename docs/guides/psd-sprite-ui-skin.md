# PSD Sprite and UI Skin Authoring

QuaEngine supports build-time PSD/PSB import for character sprites and Unity-style 9-slice UI skins. The importer produces normal QuaAssets entries, so the same files work in static QPK builds and runtime QPK packages.

## Character Sprites

Put character PSD/PSB sources under:

```text
assets/characters/<family>/<source>.psd
assets/characters/<family>/<source>.psb
```

Visible raster layers and groups are exported as PNG files under `characters/<family>/`. Layers named `base`, `sprite`, or `default` become the base sprite. Other visible exportable layers become expression assets and are collected into `characters/<family>/sprite.manifest.json`.

Example output:

```text
characters/alice/base.png
characters/alice/happy.png
characters/alice/sprite.manifest.json
```

A physical `characters/<family>/sprite.manifest.json` is authoritative. When it exists, the importer still exports PSD layers, but it does not generate a replacement manifest.

## UI Skins

Put UI skin PSD/PSB sources under either:

```text
assets/ui/<theme>/<skin>.psb
assets/ui/<theme>/<skin>/source.psb
```

Visible layers named `default`, `hover`, `pressed`, `disabled`, and `selected` become skin state PNGs:

```text
ui/default/button/default.png
ui/default/button/hover.png
ui/default/button/pressed.png
```

Add an explicit `ui-skin.json` next to the skin or at the theme root:

```text
ui/default/button/ui-skin.json
ui/default/ui-skin.json
```

Example:

```json
{
  "family": "default",
  "skins": {
    "button": {
      "base": { "asset": "button/default.png" },
      "states": {
        "hover": { "asset": "button/hover.png" },
        "pressed": { "asset": "button/pressed.png" },
        "disabled": { "asset": "button/disabled.png" }
      },
      "slice": { "top": 4, "right": 4, "bottom": 4, "left": 4 },
      "mode": "sliced",
      "fill": true,
      "contentInsets": { "top": 8, "right": 12, "bottom": 8, "left": 12 }
    }
  }
}
```

The generated manifest is:

```text
ui/<theme>/ui-skin.manifest.json
```

`slice` is explicit by design. The importer does not infer 9-slice margins from image pixels. A physical `ui/<theme>/ui-skin.manifest.json` wins over generated output.

## Runtime Projection

Skin selection is projected through `view.plugins.ui`, not renderer-owned state:

```ts
view.plugins.ui = {
  themeId: 'default',
  defaults: {
    button: 'button',
    panel: 'panel',
    input: 'input',
    tab: 'tab',
    toggle: 'toggle',
  },
}
```

Controls may override the default:

```ts
choice.presentation = { skinId: 'button' }
view.ui.overlays = {
  settings: { open: true, skinId: 'panel' },
}
```

Web rendering uses `border-image` plus `contentInsets` padding. Hover, pressed, focus, disabled, and selected states stay transient in the renderer; they are never authoritative engine state.

## PSD Support Boundaries

The first importer supports raster layers, groups, order, opacity, offsets, blend modes, and masks. Text layers, smart objects, and adjustment layers should be rasterized before import, or represented by exported raster layers. Runtime atlas 9-slice and Photoshop-perfect full feature emulation are intentionally out of scope.

All generated assets must continue through Quack/QPK packaging. Do not ship generated PSD sprites or UI skins through loose runtime resource pushes.
