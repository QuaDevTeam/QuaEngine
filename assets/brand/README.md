# QuaEngine / QuaDevTeam brand kit

The shared identity is an original Japanese anime heroine: silver-white hair with aqua accents, turquoise eyes, a navy star-and-ribbon hairpin, and a bright smile. Use the same character for the organization and project so the two remain recognizable together.

## Files

| File | Use |
| --- | --- |
| [mascot.png](mascot.png) | Reviewed 1024 × 1024 source portrait |
| [quadevteam-icon.png](quadevteam-icon.png) | 1024 × 1024 organization avatar, suitable for square or circular display |
| [quaengine-icon.png](quaengine-icon.png) | 1024 × 1024 project avatar |
| [quaengine-favicon.png](quaengine-favicon.png) | 64 × 64 browser tab icon |
| [quaengine-banner.png](quaengine-banner.png) | 1280 × 640 README hero / repository social preview, with an explicit WIP label |
| [quadevteam-logo.png](quadevteam-logo.png) | 960 × 320 organization wordmark with portrait |
| [generation.json](generation.json) | Model, quality, prediction IDs, and selection notes |

PNG exports have an opaque pale background. They are not transparent character cutouts. The original portrait stays separate from the composited typography and WIP label.

## Export

From the repository root, install Pillow in your Python environment, then run:

```bash
python3 scripts/brand/export.py --font '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'
```

The checked-in wordmarks were rendered with macOS Arial Rounded MT Bold. On other platforms pass the path to an appropriate local TrueType font; this may change the typography. No font binary is redistributed, and the exported PNG files need no installed fonts at display time.

The script derives all sizes from `mascot.png`. It also updates `demo/public/{icon,favicon}.png` and the Vue starter's `assets/app/{icon,favicon}.png`. Their `qua.project.yaml` files declare these sources; the demo's HTML favicon link must point to the PNG too.

The artwork was generated with the **Replicate CLI**, model **openai/gpt-image-2**: two `low` drafts, followed by a `medium` refinement of the selected silver/aqua portrait. The built-in image generator was unavailable in this session. No `high` generation was requested. Drafts were visually reviewed before the selected image became the reference for refinement.

## GitHub placement

- Organization: upload `quadevteam-icon.png` in [QuaDevTeam profile settings](https://github.com/organizations/QuaDevTeam/settings/profile).
- Repository: upload `quaengine-banner.png` in [QuaEngine Settings → Social preview](https://github.com/QuaDevTeam/QuaEngine/settings). A GitHub repository has a social preview image rather than a separate organization-style avatar.
- The root README references the banner with a repository-relative path.

Files in this directory prepare those placements; their presence does not mean the GitHub settings have been updated.

## Rights

These are reserved QuaDevTeam brand assets, not Apache-2.0 source code or a reusable game asset pack. See [TRADEMARKS.md](../../TRADEMARKS.md) and [LEGAL.md](../../LEGAL.md). Starter copies are development placeholders; replace them with your game's own artwork before distribution.

The SVG files are lightweight wrappers for the adjacent PNG exports so existing SVG consumers receive the same reviewed anime artwork. The project manifests intentionally point to PNG files for predictable favicon/PWA/native packaging.
