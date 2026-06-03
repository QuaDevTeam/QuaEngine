# 断链纪元

`demo/` is the QuaEngine visual novel demo project. It presents a near-future story about a human resistance group, a city-scale predictive AI, and a machine witness named Unit-7.

The demo is also the reference application for the current Web/Vue visual novel stack: engine plugins, Vue renderer plugins, settings/save/load scenes, backlog, story tree, typewriter text, character staging, sprite expressions, background transitions, CG overlays, and generated assets.

## Copyright

The demo game is proprietary demo content. Its story, characters, artwork, generated images, CGs, UI presentation, and scenario text are fully copyrighted and are not distributed under the repository's open-source package license unless a separate written license says otherwise.

Engine source packages outside `demo/` keep their own package licenses.

## What This Demo Shows

- Vue renderer preset with a custom visual novel UI skin.
- Main menu, in-game menu, settings, save/load, backlog, and story tree panels.
- Settings and save/load UI as scene-like surfaces with their own overlay presentation.
- Typewriter dialogue, auto/skip flow, input-driven auto cancellation, and keyboard/click advance.
- Backlog entries that are view-only by default. Rewind is exposed only when the backlog policy marks an entry rewindable.
- Story graph driven story tree projection with spoiler-safe locked entries.
- Background fade/crossfade transitions without renderer-owned game state.
- Character enter/exit fade defaults, sprite sizing normalization, expression changes, and CG overlay support.
- Runtime package aware asset and projection handling.

## Project Structure

| Path | Purpose |
| --- | --- |
| `src/game/bootstrap.ts` | Engine setup, plugin registration, Vue app shell, menu/settings/save/load/backlog/story tree wiring |
| `src/game/styles.scss` | Demo-specific visual styling over renderer semantic classes |
| `src/game/scenes/*.qs` | QuaScript scenario files |
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
```

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

The demo story tree is registered through `@quajs/story-graph` in `src/game/bootstrap.ts`. Locked nodes are projected through chapter-select options instead of being hidden by renderer-only logic.

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
- `@quajs/plugin-background`
- `@quajs/plugin-backlog`
- `@quajs/plugin-fonts`
- `@quajs/plugin-settings`
- `@quajs/plugin-sprite`
- `@quajs/story-graph`
- `@quajs/renderer-vue` visual novel preset

The renderer remains projection-only. Menu, settings, save/load, backlog, and story tree actions flow through engine/plugin APIs or pipeline events.

## Build Output

`pnpm --filter demo build` creates a production Vite build and a QPK asset bundle in `demo/dist/`. Generated `dist/` output is not source content.
