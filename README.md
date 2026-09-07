# QuaEngine

QuaEngine is a TypeScript visual novel engine for Galgame-style projects. It is built around a strict split between an authoritative logic runtime and renderer projections:

- `@quajs/engine` owns narrative state, scenes, checkpoints, save/load, runtime package lifecycle, UI overlay state, plugin projections, and story flow.
- `@quajs/pipeline` is the only communication channel between logic, scripts, plugins, and renderers.
- Renderers consume view projections and emit user intents. They do not own game state.
- Feature behavior lives in package-local plugins instead of being hardwired into engine core.
- Dynamic content is delivered as Quack-built QPK Runtime Packages and activated through the engine runtime package manager.

## Workspace Map

| Area | Packages |
| --- | --- |
| Core runtime | `@quajs/engine`, `@quajs/store`, `@quajs/pipeline`, `@quajs/assets` |
| Game features | `@quajs/character`, `@quajs/story-graph` |
| Platform adapters | `@quajs/assets-web`, `@quajs/assets-node`, `@quajs/assets-memory`, `@quajs/store-web`, `@quajs/store-node`, `@quajs/security-web` |
| Feature plugins | `@quajs/plugin-achievement`, `@quajs/plugin-animation`, `@quajs/plugin-audio`, `@quajs/plugin-background`, `@quajs/plugin-backlog`, `@quajs/plugin-fonts`, `@quajs/plugin-gallery`, `@quajs/plugin-inventory`, `@quajs/plugin-settings`, `@quajs/plugin-sprite` |
| Renderers | `@quajs/renderer-web`, `@quajs/renderer-vue`, `@quajs/renderer-react`, `@quajs/renderer-svelte` |
| Build and tooling | `@quajs/quack`, `@quajs/script-compiler`, `@quajs/vite-plugin`, `@quajs/project-inspector`, `@quajs/language-server`, `@quajs/vscode-quascript`, `create-qua-game` |

## Architecture

QuaEngine treats the renderer as a projection canvas. Engine plugins update engine-owned state or plugin projections; renderer packages turn those projections into DOM, audio, layout, and framework-specific components.

Important boundaries:

- `@quajs/render-core` defines universal renderer contracts only.
- `@quajs/renderer-web` owns shared Web implementation details such as DOM projection helpers, object URLs, WebAudio runtime, stage layout math, and Web renderer plugin factories.
- Vue, React, and Svelte renderers are adapters over `@quajs/renderer-web`.
- Optional renderer features are exposed through explicit subentries such as `@quajs/renderer-web/plugins/backlog` and `@quajs/renderer-vue/plugins/settings`.
- Official renderers provide semantic DOM, stable classes/data attributes, and optional style entrypoints. They do not auto-import visual CSS.

## Runtime Packages

Dynamic and AI-generated content must be package-based:

1. Quack builds a `.qpk` bundle with runtime package manifest metadata.
2. QuaAssets mounts the QPK as a side-by-side dynamic asset bundle.
3. `RuntimeContentManager` verifies trust policy, activates engine plugins, script modules, story graph deltas, store migrations, and renderer plugin manifests.
4. Save/load, jumps, backlog entries, voice replay, chapter select, and active projections preserve required runtime package dependencies before restore or unload.

See `docs/design/dynamic-runtime-qpk.md` for the full contract.

## Feature Plugins

Feature plugins are independent packages. They own their feature-specific engine APIs, state/projection contracts, QuaScript decorators, and optional settings integration.

| Plugin | Responsibility |
| --- | --- |
| `@quajs/plugin-achievement` | Profile-persistent achievements, conditions, rewards, notifications, and an achievement board scene |
| `@quajs/plugin-animation` | Engine-owned timeline animation projections for characters, backgrounds, UI, and effects |
| `@quajs/plugin-audio` | Audio intent projection for voice, BGM, SFX, ambient tracks, buses, gain, EQ, and automation |
| `@quajs/plugin-background` | Image/video/layered background projection, transitions, and CG overlays |
| `@quajs/plugin-backlog` | Dialogue/choice backlog recording, compact projection, optional rewind, and voice replay references |
| `@quajs/plugin-fonts` | Engine-owned font face projection for renderer font registration |
| `@quajs/plugin-gallery` | Profile-persistent gallery catalogs, unlocks, and a gallery scene shell |
| `@quajs/plugin-inventory` | Profile-persistent inventory definitions and quantities, intentionally UI-less |
| `@quajs/plugin-settings` | Developer/player settings registry, validation, persistence bridge, and renderer projection |
| `@quajs/plugin-sprite` | Sprite manifests, expression diff resolution, UI skins, Quack integration, and dev HMR helpers |

Each plugin package has its own README under `packages/plugins/*/README.md`.

## Story Graph

`@quajs/story-graph` owns story metadata, route/lane/timeline/protagonist graph records, story events, jump resolution, unlock state, and chapter select projection.

Chapter select is derived from graph nodes marked with `chapterSelect`. It is not a second source of truth. Locked chapter-select entries can be spoiler-safe:

- `lockedVisibility: 'placeholder'` shows redacted title/summary/thumbnail.
- `lockedVisibility: 'hidden'` omits the locked entry from projection.
- `lockedVisibility: 'revealed'` shows the real entry before unlock.
- `lockEntryUntilUnlocked` controls whether a locked entry can be entered.

See `packages/game/story-graph/README.md`.

## QuaScript

QuaScript is the narrative DSL for dialogue, choices, story-point metadata, and plugin decorators. Feature packages publish their own decorators through package-local `./script-compiler` subentries, while `@quajs/script-compiler` handles orchestration and import wiring.

Example:

```qs
@SetBackground('images/bg/station-night.png', { transition: { type: 'fade', duration: 400 } })
@PlayBGM('audio/bgm/night-grid.ogg', { loop: true, fadeInMs: 600 })
Narrator: The station lights come back one row at a time.
```

## Demo

The demo project lives in `demo/` and showcases the current visual novel stack:

- Vue renderer preset with custom UI skinning.
- Main menu, settings, save/load, backlog, and story tree panels.
- Typewriter text, auto/skip controls, input handling, and overlay animation.
- Story graph based spoiler-safe story tree locking.
- Character sprites, background transitions, CG overlays, and generated demo assets.

The demo story, characters, artwork, and generated assets are proprietary demo content and are not covered by the open-source package license. See `demo/README.md`.

## Development

Requirements:

- Node.js `>=20`
- pnpm `12.3.4`

Common commands:

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run ci
```

Useful focused commands:

```bash
pnpm --filter demo dev
pnpm --filter demo build
pnpm --filter @quajs/story-graph test -- --run
pnpm --filter @quajs/renderer-vue test -- --run
pnpm --filter @quajs/plugin-backlog test -- --run
```

## Documentation

- `docs/design/dynamic-runtime-qpk.md`
- `docs/design/mobile-rendering-adaptation.md`
- `docs/design/background-composition-animation.md`
- `docs/security/web-security.md`
- `packages/core/engine/docs/global-api.md`
- `packages/core/engine/docs/plugin-system.md`
- `packages/game/story-graph/README.md`
- `packages/render/web/README.md`
- `packages/render/vue/README.md`
- `packages/render/react/README.md`
- `packages/render/svelte/README.md`
- `demo/README.md`

## License

QuaEngine source packages are licensed under Apache-2.0 unless a file, package,
or directory states otherwise.

QuaEngine names, logos, icons, badges, and related brand assets are not licensed
under open-source software licenses. See `TRADEMARKS.md` and `NOTICE`.

Demo game content under `demo/` is proprietary and fully copyrighted. See
`demo/LICENSE`.

For a plain-language summary of these boundaries, see `LEGAL.md`.
