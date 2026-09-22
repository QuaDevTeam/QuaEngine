# QuaEngine / QuaDevTeam brand kit

The shared identity is an original, simple chibi guide: strawberry-pink bob, mint star hairpin and ribbon, dark oval eyes, peach cheeks, and a small smile. The cream, sakura and mint palette also defines the documentation site. Current artwork has **no WIP label**.

## Files

| File | Use |
| --- | --- |
| [mascot.png](mascot.png) | Reviewed 1024 × 1024 source illustration |
| [mascot.webp](mascot.webp) | 640 × 640 optimized website illustration |
| [avatar-96.webp](avatar-96.webp) | 96 × 96 navigation / small avatar |
| [quadevteam-icon.png](quadevteam-icon.png) | 1024 × 1024 organization avatar |
| [quaengine-icon.png](quaengine-icon.png) | 1024 × 1024 project avatar |
| [quaeditor-icon.png](quaeditor-icon.png) | 1024 × 1024 Editor app icon: macOS squircle mascot tile and mint editing pencil |
| [quaengine-favicon.png](quaengine-favicon.png) | 64 × 64 browser icon |
| [quaengine-banner.png](quaengine-banner.png) | 1280 × 640 general-purpose brand banner |
| [quaengine-readme-light.png](quaengine-readme-light.png) / [dark](quaengine-readme-dark.png) | 1600 × 600 theme-aware README cover |
| [quaengine-docs-light.png](quaengine-docs-light.png) / [dark](quaengine-docs-dark.png) | 1440 × 980 actual documentation screenshots |
| [readme-previews.json](readme-previews.json) | Screenshot source, viewport, browser and capture date |
| [quaengine-social.png](quaengine-social.png) | 1200 × 600 repository / website social preview |
| [quadevteam-logo.png](quadevteam-logo.png) | 960 × 320 organization wordmark |
| [generation.json](generation.json) | Model, quality, prediction ID and provenance |
| [Final prompt](prompts/chibi-mascot-medium.txt) | Reproducible generation specification |

The avatars have an opaque cream background. The Editor icon has transparent outer margins around its continuous-corner cream tile. SVGs embed the matching raster export, so they work as standalone files and in image elements. Older candidates and prompts are historical exploration, not current brand variants.

## Generation and export

Generated through **Replicate CLI**, model **openai/gpt-image-2.5-flare**, quality **medium**, on 2026-09-21. The user-provided chibi image was a style reference only and is not redistributed. The selected source was visually reviewed before integration. Typography is composed locally so the brand name is exact.

Install Pillow in your Python environment, then run from the repository root:

```bash
python3 scripts/brand/export.py --font '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'
```

On another platform, supply a local TrueType font you may use for rendering. The font is not redistributed. The exporter updates the canonical PNG/WebP files, `demo/public/{icon,favicon}.png`, and the Vue starter's `assets/app/{icon,favicon}.png`. Existing project manifest paths remain valid. `docs/scripts/prepare-content.mjs` copies the web assets to the ignored docs static directory.

## Editor application icon

`scripts/brand/editor.py` composes the existing reviewed mascot with a mint pencil, continuous-corner squircle and subtle shadow; it does not regenerate the character. It runs as part of the full brand export, or independently with `python3 scripts/brand/editor.py` (no font required).

The flattened desktop icon uses an **824 × 824 px tile centered on a 1024 × 1024 px transparent canvas** (100 px inset), matching the visible footprint measured in macOS system app icons. Three Bézier segments ease each corner into the straight edges; do not substitute a circular `rounded_rectangle`. The complete mascot/pencil composition scales together and is clipped to that silhouette, so decoration cannot enlarge its footprint. A restrained shadow stays within the transparent margin. Review the export at small sizes and beside system apps in the actual Dock after regenerating.

Reference: [Apple Human Interface Guidelines — App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) and [Apple Design Resources](https://developer.apple.com/design/resources/). These PNG/ICNS files are flattened desktop resources for Electron's current icon path. Apple's **Icon Composer layers** instead require full-bleed, unmasked input for system masking/effects; do not feed this padded, pre-masked export into that workflow.

The Electron build consumes `quaeditor-icon.png` and produces `dist/icons/quaeditor.png`, `.icns` (standard and Retina representations up to 1024 px) and `.ico` (16–256 px). Run `node packages/editor/electron/scripts/build-icons.mjs` to refresh only these platform resources. The app uses the bundled PNG for its window and macOS Dock. A future editor installer must use the ICNS/ICO for the app bundle/executable icon as well; this export is not an installer or a signing step. These assets identify the editor, independently of a game's configured icon.

## GitHub placement

- Organization avatar: [QuaDevTeam profile settings](https://github.com/organizations/QuaDevTeam/settings/profile), using `quadevteam-icon.png`.
- Repository social preview: [QuaEngine settings](https://github.com/QuaDevTeam/QuaEngine/settings), using `quaengine-social.png`.
- Project README: references the local banner automatically.

The files are ready for those placements. Local exports do not imply the remote GitHub settings have been updated. A repository has a social preview rather than an organization-style avatar.

## README presentation

The README uses GitHub-compatible `<picture>` elements with `prefers-color-scheme` to select the matching cover and documentation screenshot. The light image is the fallback. Keep links, commands, feature summaries, license information and progress limits as real text, not text embedded in an image.

`scripts/brand/readme.py` composes the covers from the existing reviewed mascot during the normal export. It does not regenerate or recolor the character. To refresh the documentation screenshots, start the production docs preview, then run from the repository root:

```bash
node scripts/brand/capture-docs.mjs
```

Install the docs dependencies first. The capture uses local Chrome or Playwright Chromium; `DOCS_TEST_URL` and `CHROME_PATH` can override their locations. The screenshots show the actual first-scene tutorial, not an editor/game mockup, and their provenance is recorded in `readme-previews.json`.

## Rights

Reserved QuaDevTeam brand assets, not an Apache-2.0 illustration library. See [TRADEMARKS.md](../../TRADEMARKS.md) and [LEGAL.md](../../LEGAL.md). Starter copies are development placeholders; replace them with your game's artwork before distribution.
