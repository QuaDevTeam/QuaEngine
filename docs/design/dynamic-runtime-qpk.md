# Dynamic Runtime QPK Architecture

This document defines the development standard for AI generated incremental content in QuaEngine. Runtime content is delivered as signed QPK packages produced by Quack, mounted by QuaAssets, and activated by the engine through `RuntimeContentManager`.

## Goals

- Treat every AI generated increment as a package, not as loose resource pushes.
- Keep the renderer stateless and transient.
- Preserve save/load, rewind, backlog, timeline, animation, audio, and store state correctness when packages are loaded, continued, unloaded, or restored later.
- Support multiple QPK packages continuing the same scene, timeline, lane, or visual composition.
- Make production runtime JS loading verifiable through hash/signature trust policy.

## Terms

- **Runtime Package**: A dynamic QPK with `manifest.runtimePackage`. It may contain assets, compiled QuaScript modules, engine/renderer/compiler plugin modules, story graph deltas, and store migrations.
- **Bundle**: A QuaAssets mounted unit. Runtime packages mount as side-by-side bundles and do not patch an existing bundle unless an explicit force replacement is requested.
- **Content provenance**: `contentPackageId` records the primary package that created a story point or projection. `requiredRuntimePackages` records all packages that must be present to safely restore or keep that projection.
- **View projection**: Engine-owned render-relevant state such as characters, background, choices, effects, UI overlays, animations, and plugin projections.

## Package Flow

1. Quack builds a `.qpk` in dynamic mode.
2. QuaAssets loads it with `loadDynamicBundle(source, options)` and stores `runtimePackageId`, priority, version, and loaded time on the bundle and its assets.
3. Engine calls `loadRuntimePackage(source)` through `RuntimeContentManager`.
4. The trust policy verifies required hash/signature metadata before activation.
5. Engine activates runtime engine plugins, story graph deltas, store migrations, script modules, and renderer plugin manifests.
6. Renderer receives only pipeline events and view snapshots. Web runtime code loads renderer plugin JS through a Web-side loader, not through engine core.

Runtime packages are additive side-by-side mounts. Use the old patch flow only to update an already existing bundle. Do not model AI generated scene continuations as individual resource pushes.

## Manifest Contract

`manifest.runtimePackage` is the source of truth for activation:

- `id`, `version`, optional `sequence`, `priority`, and `dependencies`
- `scripts[]` for compiled QuaScript modules
- `plugins[]` for engine, renderer, or compiler plugin modules
- `storyGraphDeltas[]` for graph, node, edge, lane, route, and timeline increments
- `storeMigrations[]` for idempotent runtime state/schema defaults
- `integrity` and `signature` for production trust policy

Dynamic QuaScript modules must use stable IDs. Do not generate random step UUIDs for runtime content. Compile step IDs from module ID, stable seed, and step index or label so save/load and read-progress keys remain deterministic.

## Asset Resolution

QuaAssets must rank non-explicit lookups by:

1. explicit `bundleName`, when provided
2. `bundlePriority`
3. asset or bundle `version`
4. `loadedAt`
5. locale match and default locale fallback

Provider records and stored bundle records must follow the same ranking. A dev provider should not accidentally override a higher-priority runtime package for the same asset name.

Dynamic unload removes that bundle's assets and emits `asset:changed` removals. Renderer object URLs, WebAudio buffers, and DOM plugin resources are renderer implementation details and must refresh or dispose through existing asset revision paths.

## Engine Runtime Ownership

`RuntimeContentManager` owns runtime package lifecycle in `@quajs/engine`:

- `loadRuntimePackage(source, options)`
- `activateRuntimePackage(packageId)`
- `unloadRuntimePackage(packageId, options)`
- `getRuntimePackages()`
- `registerScriptModule(record)`
- `runScriptModule(moduleId, scope?)`
- `ensureRuntimePackages(packageIds)`

Engine core stays platform neutral. JS byte loading and `import()` are supplied through injected runtime module loaders. Engine core must not use `Blob`, object URLs, DOM APIs, or browser globals.

## Save, Load, And Jump

Every save slot, checkpoint, story point, backlog entry, and rewind target that touches runtime content must carry dependencies.

- Story points use `contentPackageId`, `scriptModuleId`, and `scriptModuleVersion`.
- Checkpoint and save metadata use `requiredRuntimePackages`.
- View projections can carry `contentPackageId` and `requiredRuntimePackages`.
- Before jump/load/rewind, engine must ensure required packages are active.
- If the registry cannot resolve a missing package, restore must fail clearly instead of partially restoring broken state.

Default unload must reject packages referenced by current story point, current checkpoint metadata, or current view projection. `{ force: true }` is reserved for teardown, rollback, tests, or deliberate state eviction after moving the player to safe content.

## Same Scene Continuation

Multiple QPKs may continue the same scene, timeline, lane, route, or visual composition. This is expected.

Rules:

- Do not key read progress by `sceneId + stepId` alone. Include `contentPackageId`, script module identity, lane, route, timeline, protagonist, node, and line where applicable.
- If package A creates a character/background and package B changes expression, sprite, position, layer, lighting, or animation, the projection must require both A and B.
- A package-scoped update must not steal ownership of existing base layers unless it replaces them deliberately.
- Save/load must restore all required packages, not just the package of the current story point.

This allows a generated package to add "the next moment" in the same scene without forcing scene boundaries or duplicating base assets.

## Story Graph And Timeline

`@quajs/story-graph` owns route, lane, protagonist, timeline, node, and edge metadata. Engine core should not hardcode timeline semantics.

Runtime graph deltas must be package-scoped:

- nodes, edges, lanes, routes, and timeline records carry package provenance
- choice targets may point into dynamic nodes or dynamic script modules
- unloading one package must remove only that package's graph delta and leave other same-scene packages intact

## Store Migration Policy

Runtime packages may migrate state only through declared, idempotent migrations.

- Each migration is keyed by package ID, migration ID, and version.
- Applied migrations are stored in engine-owned runtime state.
- Migrations may set defaults, register scopes, or upgrade projections.
- Migrations must not blindly overwrite player progress, choices, settings, or current scene state.
- Re-activation must not re-run already applied migrations.

## Plugin Development Rules

Feature plugins must treat runtime package activation/unload as part of their state model.

- Add `onRuntimePackageActivate`, `onRuntimePackageUnload`, or `onRuntimePackageMigrate` when the plugin owns package-scoped state.
- Any engine-owned projection written by runtime content must carry package provenance.
- If a projection can depend on multiple packages, preserve `contentPackageId` and merge `requiredRuntimePackages`.
- On unload, remove only state that belongs to or requires that package.
- Unknown plugin projections are still engine-owned view state; force unload may clear plugin projections that declare runtime package dependencies.

Plugin-specific expectations:

- **backlog**: entries and voice replay carry required packages; replay/rewind ensures packages before use.
- **settings**: dynamic settings scopes carry package ID; unload unregisters scope but preserves player values.
- **animation**: definitions, active playback, and filled final projections carry package ID; unload removes package-owned definitions and active/final projections.
- **audio**: tracks and chapter voice defaults carry package ID; unload stops tracks and clears package-owned chapter/current-line references.
- **background**: background and layers carry package metadata; layer updates during runtime content merge package dependencies.
- **character/sprite**: character projection owns runtime provenance; sprite renderer remains a stateless asset projection.
- **renderer plugins**: engine only emits renderer plugin manifests through the pipeline; Web renderer loads/destroys transient plugin resources.

## Sprite Deltas

Runtime sprite packages may contain expression-only deltas. For example, a package with `characters/alice/expressions/happy.png` may generate a sprite manifest that references `alice/base.png` from an earlier bundle and overlays the new expression layer.

Do not require every runtime package to duplicate base character art. Asset ranking and package dependency metadata are what make cross-package sprite composition safe.

## Trust Policy

Production runtime JS and plugin modules require integrity and signature verification. Development and tests may opt into unsigned packages explicitly.

Rules:

- `trustPolicy.requireSignature` rejects unsigned packages.
- `runtimePackage.integrity.hash` is the Quack manifest `merkleRoot`; it is stable because it is derived from package payload assets instead of the final QPK bytes that contain the manifest itself.
- `trustPolicy.verifyPackage` receives the full bundle hash plus manifest metadata, including the package integrity hash and manifest merkle root.
- Failed trust verification must unload the mounted bundle and leave runtime package state clean.
- Engine core verifies policy but does not perform Web module import details.

## Required Test Coverage

Any runtime package feature should include targeted coverage for:

- dynamic QPK manifest creation with assets, scripts, plugins, graph deltas, migrations, and trust metadata
- dynamic bundle load/unload, same asset ranking, locale fallback, and `asset:changed`
- stable script step IDs and same-scene multi-package continuation
- save/load and jump with missing package failure and registry recovery
- story graph/timeline deltas from multiple packages in the same scene
- store migration idempotency
- unload protection for story point, checkpoint metadata, and view projection
- plugin state cleanup for backlog, settings, animation, audio, background, sprite/character, and renderer plugins

## Review Checklist

- Does every authoritative state mutation go through engine/store APIs?
- Does every runtime-created projection carry `contentPackageId` or merge `requiredRuntimePackages`?
- Does save/load capture view-level package dependencies, not only story point dependencies?
- Can package B continue package A's scene without corrupting read progress or unload cleanup?
- Does default unload reject active dependencies?
- Does force unload clear runtime projections before assets are removed?
- Are store migrations declared, idempotent, and non-destructive?
- Are dynamic JS/plugin modules loaded through injected loaders and verified by trust policy?
- Is renderer state still transient and replaceable?
