# 断链纪元

`demo/` is the QuaEngine visual novel demo project. It presents a near-future story about a human resistance group, a city-scale predictive AI, and a machine witness named Unit-7.

The demo is also the reference application for the current Web/Vue and native WGPU visual novel stacks: engine plugins, renderer feature surfaces, settings/save/load scenes, backlog, achievements, story tree, typewriter text, character staging, sprite expressions, background transitions, CG overlays, and generated assets.

## Copyright

The demo game is proprietary demo content. Its story, scenario scripts,
characters, artwork, generated images, CGs, UI presentation assets, icons,
audio, prompts, masks, and other creative materials are fully copyrighted and
are not distributed under the repository's open-source package license unless a
separate written license says otherwise.

You may download and run the demo only to evaluate or demonstrate QuaEngine. Do
not copy, redistribute, modify, extract, reuse, train on, sell, publish, or
include the demo content in another game, engine, dataset, product, template,
asset pack, or public distribution.

Engine source packages outside `demo/` keep their own package licenses.

QuaEngine names, logos, icons, badges, and related brand assets are not licensed
for reuse. See `../TRADEMARKS.md`.

## What This Demo Shows

- Vue renderer preset with a custom visual novel UI skin.
- Main menu, in-game menu, settings, save/load, backlog, and story tree panels.
- Settings and save/load UI as scene-like surfaces with their own overlay presentation.
- Multi-stack overlay placement with engine-owned `overlayStack` and `zIndex` ordering for menu, save/load, backlog, settings, gallery, modal confirms, and toasts.
- Typewriter dialogue, auto/skip flow, input-driven auto cancellation, and keyboard/click advance.
- Backlog entries that are view-only by default. Rewind is exposed only when the backlog policy marks an entry rewindable.
- Story graph driven story tree projection with spoiler-safe locked entries.
- CG gallery catalog registration, profile-level unlock state, and story-driven unlock toasts.
- Background fade/crossfade transitions without renderer-owned game state.
- Character enter/exit fade defaults, sprite sizing normalization, expression changes, and CG overlay support.
- Runtime package aware asset and projection handling.

## Project Structure

| Path | Purpose |
| --- | --- |
| `src/game/bootstrap.ts` | Vue app shell, menu/settings/save/load/backlog/gallery/story tree wiring, and pipeline listeners |
| `src/game/runtime.ts` | Web asset runtime, QuaEngine setup, runtime loaders, trust policy, and plugin registration |
| `src/game/config.ts` | Demo constants such as title copy, BGM keys, locale defaults, and runtime trust keys |
| `src/game/content/*.ts` | Gallery catalog entries and story graph/chapter-select definitions |
| `src/game/story/main-scene.ts` | Main scene route state, choices, BGM cues, and story-driven gallery unlocks |
| `src/game/ui/*.ts` | UI projection helpers, overlay scene metadata, slot labels, and settings slot renderers |
| `src/game/styles.scss` | Demo theme entrypoint that imports feature-specific style modules |
| `src/game/styles/*.scss` | Demo visual skin split by base, shell, dialogue, system panels, gallery, motion, and responsive rules |
| `src/game/scenes/*.qs` | QuaScript scenario files |
| `src/targets/native/session.ts` | Native application navigation over the shared engine, plugins, `MainScene`, and QuaScript story |
| `assets/ui/native-app.qui` | Complete native title, HUD, game menu, confirmation, story tree, save/load, and game-over UI structure |
| `assets/ui/native-app.qss` | Native demo shell presentation and interaction states |
| `assets/images` | Backgrounds, CGs, and UI imagery |
| `assets/characters` | Character sprite assets and expression families |
| `scripts/generate-assets.mjs` | Asset generation/regeneration pipeline |
| `dist/` | Generated build output, not source |

## Local Commands

Run from the repository root:

```bash
pnpm install
pnpm --filter demo dev
pnpm --filter demo build
pnpm --filter demo typecheck
pnpm dev:native
pnpm native:e2e
```

`pnpm dev:native` launches the complete native demo from its QPK and watches its TypeScript, QuaScript, QUI/QSS, assets, and native renderer sources. It does not accept panel or scene fixtures.

`pnpm native:e2e` is the native demo availability gate. It drives the real rendered command bounds through the native input bridge: title menu, START, shared `MainScene` dialogue advance, the HUD skip control, a real story choice, game menu, title confirmation, settings, gallery, and the final return to the title menu. Skip is enabled and disabled through the rendered HUD after the E2E has already proved the typewriter and engine `USER_ADVANCE` path; it is not a session-state shortcut. Single-scene and single-panel smoke commands are intentionally not part of product validation.

Asset commands:

```bash
pnpm --filter demo assets:generate
pnpm --filter demo assets:regenerate
pnpm --filter demo assets:regenerate-backgrounds
pnpm --filter demo assets:regenerate-cgs
pnpm --filter demo assets:regenerate-characters
pnpm --filter demo assets:build
```

`assets:generate` only fills missing images. Regeneration commands intentionally replace matching asset families.

## Asset Generation Notes

The generation script uses the local Replicate CLI profile `quaengine-demo`. Do not commit API keys, local credentials, raw prompts, failed generations, temporary masks, or unused raw generation output.

Character regeneration currently favors an anime-oriented image model, solid light/dark background, background removal, cleanup, and sprite-size normalization. Character and CG generation should keep character identity, outfit, color language, and world details consistent.

Committed demo assets should be final assets used by the demo. Unused raw material under generated working directories should be removed.

## Story Tree Locking

The demo story tree is registered through `@quajs/story-graph` in `src/game/content/story-tree.ts`. Locked nodes are projected through chapter-select options instead of being hidden by renderer-only logic. The Vue-facing node projection lives in `src/game/ui/story-tree.ts`.

Before unlock, route nodes show only a neutral chapter label, `LOCKED`, and placeholder copy. Real route titles, summaries, thumbnails, and metadata are not projected to the renderer until the node is unlocked.

This is the intended pattern for spoiler-sensitive chapter select UI:

```ts
chapterSelect: {
  title: node.title,
  summary: node.description,
  lockedVisibility: 'placeholder',
  lockedTitle: `CH ${node.chapter}`,
  lockedSummary: '继续主线后解锁该路线节点。',
  lockEntryUntilUnlocked: true,
}
```

## Plugin Stack

The demo uses:

- `@quajs/plugin-animation`
- `@quajs/plugin-achievement`
- `@quajs/plugin-background`
- `@quajs/plugin-backlog`
- `@quajs/plugin-fonts`
- `@quajs/plugin-gallery`
- `@quajs/plugin-settings`
- `@quajs/plugin-sprite`
- `@quajs/story-graph`
- `@quajs/renderer-vue` visual novel preset

The renderer remains projection-only. Menu, settings, save/load, backlog, achievements, and story tree actions flow through engine/plugin APIs or pipeline events. The native app shell is authored in QUI/QSS, while the native and Web demos share the same `MainScene`, QuaScript files, engine runtime, plugin definitions, content catalogs, and story graph. Native product availability is established only by the complete `pnpm native:e2e` flow.

## Build Output

`pnpm --filter demo build` creates a production Vite build and a QPK asset bundle in `demo/dist/`. Generated `dist/` output is not source content.
