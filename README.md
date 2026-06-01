# QuaEngine

QuaEngine is a TypeScript visual novel engine with a strict split between the logic runtime and renderer implementations. The engine owns narrative state, saves, runtime packages, plugin state, and view projections. Renderers consume projections and emit user intents through `@quajs/pipeline`; they do not own game state.

## Current Scope

The current workspace includes:

- platform-neutral engine, store, pipeline, asset, character, render contract, and story graph packages;
- Web, Node, Memory, and browser storage/runtime adapters;
- Quack QPK/ZIP bundling, QuaScript compilation, Vite integration, project inspection, language server, and VS Code tooling;
- engine feature plugins for achievement, animation, audio, background, backlog, fonts, gallery, inventory, settings, and sprite;
- framework-neutral Web renderer runtime plus Vue, React, and Svelte Web renderer adapters.

## Architecture Rules

- `@quajs/engine` owns authoritative game state and runtime package lifecycle.
- `@quajs/pipeline` is the only logic/render communication channel.
- `@quajs/render-core` owns universal renderer contracts.
- `@quajs/renderer-web` owns shared browser implementation details such as DOM projection, object URLs, WebAudio, stage layout math, and renderer plugin factories.
- `@quajs/renderer-vue`, `@quajs/renderer-react`, and `@quajs/renderer-svelte` are framework adapters over `@quajs/renderer-web`.
- Feature behavior belongs in package-local plugins and explicit subentries, not in engine core or renderer state.
- Runtime content must be delivered as Quack-built QPK Runtime Packages and activated through `RuntimeContentManager`.

## Key Packages

| area | packages |
| --- | --- |
| Core runtime | `@quajs/engine`, `@quajs/store`, `@quajs/pipeline`, `@quajs/assets`, `@quajs/character`, `@quajs/story-graph`, `@quajs/render-core` |
| Platform adapters | `@quajs/assets-web`, `@quajs/assets-node`, `@quajs/assets-memory`, `@quajs/store-web`, `@quajs/store-node`, `@quajs/security-web` |
| Feature plugins | `@quajs/plugin-achievement`, `@quajs/plugin-animation`, `@quajs/plugin-audio`, `@quajs/plugin-background`, `@quajs/plugin-backlog`, `@quajs/plugin-fonts`, `@quajs/plugin-gallery`, `@quajs/plugin-inventory`, `@quajs/plugin-settings`, `@quajs/plugin-sprite` |
| Renderers | `@quajs/renderer-web`, `@quajs/renderer-vue`, `@quajs/renderer-react`, `@quajs/renderer-svelte` |
| Build/tooling | `@quajs/quack`, `@quajs/script-compiler`, `@quajs/vite-plugin`, `@quajs/language-server`, `@quajs/vscode-quascript`, `create-qua-game` |

## Runtime Packages

Dynamic content is package-based:

1. Quack builds a signed `.qpk` with `manifest.runtimePackage`.
2. QuaAssets mounts the QPK as a side-by-side dynamic bundle.
3. `RuntimeContentManager` verifies trust, activates engine plugins, scene modules, script modules, story graph deltas, store migrations, and renderer plugin manifests.
4. Save/load, jump, backlog, voice replay, story graph, and active projections track required runtime packages before restore or unload.

See [docs/design/dynamic-runtime-qpk.md](docs/design/dynamic-runtime-qpk.md).

## Story Graph And Chapter Select

`@quajs/story-graph` owns route, lane, protagonist, timeline, node, edge, and story event metadata. Chapter select is modeled as a derived projection of story graph nodes marked with `chapterSelect`; it is not a second source of truth. Unlock state uses the story graph unlocked node set, and runtime package unload removes affected graph deltas and stale unlock entries.

QuaScript supports `@ChapterSelect({ title?, summary?, order?, thumbnail?, unlockOnVisit? })`.

## Inventory

`@quajs/plugin-inventory` provides programmatic item catalog and quantity APIs. It has no renderer UI. Definitions live in plugin runtime state; player quantities are persisted by profile in `QuaStore` using `@quajs/plugin-inventory:profile:<profileId>` snapshots. Profile data is intentionally independent from story save/load/rollback.

QuaScript supports `@GrantInventoryItem`, `@ConsumeInventoryItem`, and `@SetInventoryItemQuantity`.

## Renderer Presets

The Web, Vue, React, and Svelte visual novel presets expose the same feature order:

`input`, `fonts`, `background`, `sprite`, `character`, `effects`, `dialogue`, `choices`, `audio`, `scene`, `ui`, `settings`, `backlog`, `gallery`, `achievement`.

React and Svelte feature subentries are thin wrappers around `@quajs/renderer-web/plugins/*`; they do not duplicate DOM runtime behavior.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm -s turbo typecheck --summarize
```

Useful package-scoped commands:

```bash
pnpm --filter @quajs/plugin-inventory test -- --run
pnpm --filter @quajs/story-graph test -- --run
pnpm --filter @quajs/renderer-react test -- --run
pnpm --filter @quajs/renderer-svelte test -- --run
```

## Documentation

- [docs/design/dynamic-runtime-qpk.md](docs/design/dynamic-runtime-qpk.md)
- [docs/design/mobile-rendering-adaptation.md](docs/design/mobile-rendering-adaptation.md)
- [docs/design/background-composition-animation.md](docs/design/background-composition-animation.md)
- [docs/security/web-security.md](docs/security/web-security.md)
- [packages/render/web/README.md](packages/render/web/README.md)
- [packages/render/vue/README.md](packages/render/vue/README.md)
- [packages/render/react/README.md](packages/render/react/README.md)
- [packages/render/svelte/README.md](packages/render/svelte/README.md)
- [packages/plugins/inventory/README.md](packages/plugins/inventory/README.md)
- [packages/core/story-graph/README.md](packages/core/story-graph/README.md)

## License

Apache-2.0 © QuaDevTeam
