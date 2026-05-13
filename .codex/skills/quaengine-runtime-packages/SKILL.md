---
name: quaengine-runtime-packages
description: QuaEngine dynamic QPK Runtime Package development and review rules. Use when implementing, reviewing, or documenting AI-generated incremental content, `runtimePackage` manifests, QuaAssets dynamic bundles, RuntimeContentManager, dynamic QuaScript modules, story graph/timeline deltas, store migrations, runtime plugins, save/load dependency tracking, animation/audio/sprite/background diffs, or same-scene multi-QPK continuation.
---

# QuaEngine Runtime Packages

## Core Model

Treat AI generated content as Runtime Packages:

- Quack emits signed `.qpk` packages with `manifest.runtimePackage`.
- QuaAssets mounts packages as side-by-side dynamic bundles.
- Engine activates packages through `RuntimeContentManager`.
- Renderer receives pipeline events and engine-owned view state only.

Never implement generated content as loose resource pushes. Assets, scripts, store changes, story graph deltas, audio, sprites, animations, and plugins should all arrive through a QPK package.

## First Files To Read

Read only what is needed:

- Architecture: `docs/design/dynamic-runtime-qpk.md`
- Engine lifecycle: `packages/core/engine/src/runtime-content/manager.ts`
- Engine state/provenance: `packages/core/engine/src/core/engine.ts`
- Asset mounting/ranking: `packages/core/assets/src/qua-assets.ts`, `packages/core/assets/src/asset-manager.ts`, `packages/core/assets/src/providers.ts`
- Manifest types: `packages/core/assets/src/types.ts`, `packages/build/quack/src/core/types.ts`
- Story graph deltas: `packages/core/story-graph/src/index.ts`
- Feature plugin examples: `packages/plugins/animation/src/index.ts`, `packages/plugins/audio/src/index.ts`, `packages/plugins/background/src/index.ts`

## Implementation Workflow

1. Identify the owner of every state mutation. Engine/store owns authoritative state. Renderer owns only transient implementation resources.
2. Add or update manifest fields first, then update Quack output, QuaAssets parsing, engine activation, plugins, and tests together.
3. Preserve platform boundaries. Engine core accepts injected loaders and trust policy; Web runtime performs object URL and dynamic import work.
4. Put feature behavior in the feature package. Compiler decorators and runtime helpers for a feature belong to that feature package or sub-entry.
5. Update tests for save/load, unload, same-scene continuation, and package-scoped cleanup before considering the change done.

## Provenance Rules

Runtime-created projections must declare package provenance:

- Use `contentPackageId` for the primary owner package.
- Use `requiredRuntimePackages` when a projection depends on more than one package.
- Preserve existing `contentPackageId` when package B applies a diff to package A's character, background, sprite, animation fill, or audio continuation.
- Merge required packages instead of replacing metadata.
- Save slots, checkpoints, backlog entries, voice replay references, jump targets, and view projections must all be dependency-aware.

If a restore can fail without a package, that package must be recorded before saving.

## Same-Scene Continuation

Assume different QPKs can continue the same scene, lane, route, protagonist, or timeline.

Review these cases explicitly:

- read-only skip keys include package/script/lane/route/timeline/protagonist/node context
- package B can change expression/sprite/position for a character created by package A
- package B can add a background layer or lighting diff over package A's background
- package B can add voice, ambient, animation, or choices in the same scene
- unloading package A while package B still depends on it is rejected by default
- force unload clears dependent projections before assets unload

## Store And Plugin Rules

Runtime store changes must be declared migrations:

- migration key is package ID plus migration ID plus version
- migration is idempotent
- migration may set defaults or register scopes
- migration must not blindly overwrite player state

Plugin rules:

- Use `onRuntimePackageActivate`, `onRuntimePackageUnload`, and `onRuntimePackageMigrate` when the plugin owns package-scoped state.
- On unload, remove only state that belongs to or requires the package.
- Keep package-owned renderer resources transient and destroy them through renderer plugin lifecycle.
- Feature plugins must not rely on renderer caches for save/load, rewind, replay, branching, or progression.

## Asset And Sprite Rules

QuaAssets lookup without explicit `bundleName` must rank by priority, version, loaded time, then locale fallback. Provider records and stored assets must use the same ranking.

Runtime sprite packages may be expression-only deltas. Do not require a generated package to duplicate base art. Use dependency metadata to keep base art packages loaded while diff packages are active.

## Trust Rules

Production runtime JS requires trust verification:

- reject missing signature when required
- verify bundle hash and manifest trust metadata
- unload and clean state after verification failure
- keep actual Web module loading in injected/platform loaders

Development and tests may allow unsigned packages only through an explicit policy.

## Required Tests

Add focused tests for changed surfaces:

- Quack runtime manifest output
- QuaAssets dynamic load/unload, ranking, locale fallback, and asset change events
- RuntimeContentManager activation, rollback, duplicate module IDs, dependency cycles, and wrong registry resolution
- stable dynamic QuaScript step IDs
- save/load, jump, rewind, and missing package recovery
- story graph/timeline deltas in same-scene multi-QPK packages
- store migration idempotency
- animation/audio/background/sprite/settings/backlog package cleanup
- renderer plugin late-load failure and unload cleanup

Run at least the affected package `typecheck` and `test -- --run`. Run the affected package `build` when public exports or dist-dependent packages change.
