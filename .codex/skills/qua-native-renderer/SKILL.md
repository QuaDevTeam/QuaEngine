---
name: qua-native-renderer
description: Use, implement, or review QuaEngine native renderer work under packages/native, including native host bridge, native contracts, assets/store adapters, QuickJS runtime, wgpu renderer, QUI/QSS, target plugin isolation, and native package compatibility.
---

# Qua Native Renderer

Use this skill for `packages/native/*`, Rust native runtime/renderer crates, native host contracts, native asset/store adapters, QUI/QSS native authoring, and native packaging.

## Boundaries

- Native renderer is a projection layer only.
- Engine/store remain authoritative for game state, save/load, settings, audio intent, UI overlays, runtime packages, and plugin state.
- Communication uses `@quajs/pipeline` and render-core/plugin projections; do not add a second event bus.
- Runtime content remains Quack-built QPK packages. Dynamic QPKs may contain QS/JS modules and resources only, never native code.
- Native version/capability data comes from the signed native app/Rust build and is exposed through `QuaNativeHostInfo`; QPK content cannot override it.
- Rust `quajs_wgpu_renderer` consumes resolved QUI/QSS projection data only. QSS parsing, selector matching, cascade, inheritance, and language-server diagnostics belong in TS/compiler/tooling packages, not in the renderer.

## Package Responsibilities

- `@quajs/native-contracts`: serializable native host, renderer capability, compatibility, QUI/QSS, and target bootstrap contracts.
- `@quajs/engine-native`: engine plugin/adapter that reads native host info, registers renderer capabilities, and supplies runtime package compatibility guards.
- `@quajs/assets-native`: QuaAssets adapter over native host byte/storage/crypto APIs.
- `@quajs/store-native`: QuaStore persistence adapter over native host storage APIs.
- Rust `quajs_native_runtime`: QuickJS host and native host API implementation.
- Rust `quajs_wgpu_renderer`: wgpu projection renderer and transient resource management.

## Target Isolation

Web, Cocos, and native target core adapters must not be mixed:

- Web uses Web assets/renderer/framework adapters only.
- Cocos uses Cocos host/renderer only.
- Native uses `@quajs/engine-native`, `@quajs/assets-native`, `@quajs/store-native`, and Rust native runtime/renderer metadata only.
- `@quajs/native-contracts` may be used by Web/Cocos build tooling for target validation, but it must not remain in Web/Cocos runtime bundles after tree-shaking.
- Packaging a Web, Cocos, or native project must select exactly one target bootstrap. Target-specific renderer plugin entries and core adapters are not interchangeable between targets.
- Treat target core plugins as release-blocking isolation boundaries. Web artifacts must exclude Cocos/native core adapters, Cocos artifacts must exclude Web/native core adapters, and native artifacts must exclude Web/Cocos core adapters after bundling/tree-shaking, not just in source metadata.
- Validate target isolation at three layers: application bootstrap core adapters, target-specific renderer/plugin entries, and Runtime QPK renderer compatibility metadata. Do not let a pass in one layer imply the others are safe.
- Use `validateExclusiveTargetBootstrap` from `@quajs/native-contracts` to assert a packaged app/startup dependency set registers exactly one Web, Cocos, or native bootstrap. Then use `validateTargetBootstrap` for the active target and treat both `missing` required target adapters and `forbidden` cross-target adapters as blockers.
- Use `validateTargetBundleManifest` from `@quajs/native-contracts` for emitted `target-bundle-manifest.json` files. It validates the explicit selected core adapter set, normalized runtime dependencies, selected renderer entry targets, Runtime QPK renderer entry targets, and Runtime QPK executable dependencies together after bundling/tree-shaking.
- Quack/native packaging must emit a post-bundle `target-bundle-manifest.json` for every Web, Cocos, and native debug/release artifact. Validate the emitted manifest after tree-shaking, not just the source dependency set.
- Runtime startup must repeat the exclusive-target assertion before engine initialization so hand-built shells cannot register zero or multiple target core adapter sets.
- Validate package subentries by normalized package root; for example `@quajs/renderer-web/plugins/audio` is still Web core, and must not appear in native/Cocos bundles.
- Shared plugin entries must not import Web, Cocos, or native core adapters. Target entries may import only their own target adapters plus platform-neutral shared logic.
- Multi-target plugin packages may declare Web, Cocos, and native entries in source metadata, but packaging must include only the active target entry and reject accidental imports of inactive target entries.
- Renderer entry records that carry target metadata must match the artifact target. A Web/Cocos/native artifact must fail validation if an app renderer entry or Runtime QPK renderer entry declares another target, even when the entry comes from a third-party plugin package rather than an official core adapter package.
- Runtime QPKs may declare compatibility with Web, Cocos, and native, but inactive target blocks are metadata only. They must not carry executable dependencies on target core adapters, install target bootstrap plugins, or activate another target bootstrap.
- Every packaged debug/release artifact should emit a target bundle manifest and run dependency graph checks so Web builds exclude Cocos/native core adapters, Cocos builds exclude Web/native core adapters, and native builds exclude Web/Cocos core adapters.
- Runtime startup should assert exactly one target adapter set registered with the engine, so hand-built bundles cannot mix Web, Cocos, and native core plugins.

Shared engine/game/plugin packages may be reused only when platform-neutral.

## QUI/QSS Projection

- Inline QUI surface nodes are renderer projections, not authoritative UI state.
- Supported foundational QUI node kinds are `Fragment`, `Box`, `Stack`, `Row`, `Column`, `Grid`, `Backdrop`, `Button`, `Divider`, `Layer`, `SafeArea`, `Spacer`, `Text`, `Image`, `Panel`, and `Scroll`; higher-level components such as dialog, drawer, save/load panels, gallery, and settings should compose from these base nodes.
- `Fragment` is a command-free structural grouping node. It expands its children in place, inherits parent clip/z context, and must not emit draw commands or pointer intent surfaces.
- `Stack`, `Row`, `Column`, and `Grid` are command-free structural layout group nodes emitted after QUI/QSS layout resolution. They expand children in place and must not parse QSS, own layout state, draw, or emit pointer intent surfaces.
- `Divider` projects a visual separator only. It must not emit pointer intent surfaces and should be used by composites instead of ad hoc line primitives.
- `Layer` is a command-free structural z-group. It shifts child draw-command z indexes using the resolved node `z_index`, but must not draw, own state, or emit pointer intent surfaces.
- `SafeArea` is a command-free structural clip container. It constrains child draw commands and hit testing to already-resolved logical safe-area bounds without owning state.
- `Spacer` is a command-free layout spacing node emitted after QUI layout resolution. It must not draw, own state, emit pointer intent surfaces, or affect authoritative game state.
- `Backdrop` projects a semantic overlay panel. It is visual-only unless it carries an explicit intent, in which case pointer input may resolve that intent through `@quajs/pipeline`.
- `Panel` projects a semantic container panel. It is visual-only unless it carries an explicit intent, in which case pointer input may resolve that intent through `@quajs/pipeline`.
- `Scroll` currently projects a scroll panel plus clip-start/clip-end commands and per-command clip bounds for hit testing. It must not own persisted scroll position or authoritative UI state.
- Native QUI nodes may carry `UiSurfaceResolvedStyle`, representing already-resolved QSS declarations from compiler/runtime tooling.
- Current native resolved QSS style fields are `background-color`, `border-color`, `border-radius`, `border-width`, `color`, `font-family`, `font-size`, `font-weight`, `line-height`, `text-align`, and `object-fit`.
- Do not add QSS selector parsing or CSS cascade logic to `quajs_wgpu_renderer`; add those to the dedicated QSS compiler/language-server/tooling layer and emit resolved projection fields for native rendering.
- Native capability manifests must declare any consumed QSS features and QUI components so runtime packages can check compatibility before activation.
- Native media capability ids must describe implemented projection/resource contracts precisely. Do not declare QUI media components, real video decode, or audio playback capability until the Rust projection path and backend support exist; fallback-only video/audio capabilities should use deterministic `warn-once` semantics.

## Validation

Prefer light checks while disk is tight:

```bash
pnpm --filter @quajs/native-contracts typecheck
pnpm --filter @quajs/engine-native typecheck
pnpm --filter @quajs/assets-native typecheck
pnpm --filter @quajs/store-native typecheck
cargo test --manifest-path packages/native/Cargo.toml --workspace
```

Run Cargo only when disk has enough headroom. Check `df -h . $HOME/.cargo` first and clean cargo caches/targets when space is low.

## Review Checklist

- Is state still owned by engine/store/plugins?
- Does native host API avoid arbitrary filesystem, shell, network, dynamic library loading, and Rust callbacks?
- Does Rust `NativeHostInfo` serialize to the TS `QuaNativeHostInfo` shape, including camelCase fields and `debug`/`release` plus `macos`/`windows`/`linux` literals?
- Does the Rust native renderer capability manifest include projection keys, intent events, asset kinds, QSS features, QUI base components, and fallback policy?
- Are video/audio native capability declarations limited to currently implemented projection/resource paths, with real decoder/playback backend support guarded by later capability updates?
- Are native renderer version/capability checks performed before dynamic package JS evaluation?
- Does `@quajs/engine-native` install `createNativeRuntimeTrustPolicy` so runtime native-code payload guards run before QuickJS module loading?
- Do assets/store adapters preserve core contracts without Web/Node assumptions?
- Are Web/Cocos/native target core adapters isolated?
- Does the post-bundle dependency manifest prove the active artifact contains exactly one target core plugin set?
- Does `validateTargetBundleManifest` pass for the emitted Web/Cocos/native artifact, including Runtime QPK executable dependency checks?
- Is `target-bundle-manifest.json` emitted and validated for both debug and release artifacts after bundling/tree-shaking?
- Does runtime startup repeat the exclusive Web/Cocos/native bootstrap assertion before engine initialization?
- Are target isolation checks applied separately to bootstrap core adapters, renderer/plugin entries, and Runtime QPK compatibility metadata?
- Do shared plugin entries avoid importing target adapters, and do target entries avoid importing other target entries?
- Do Runtime QPKs avoid executable dependencies on Web/Cocos/native core adapters?
- Do bootstrap tests cover Web, Cocos, and native core package sets without cross-target leakage?
- Do exclusive bootstrap tests fail when zero or multiple Web/Cocos/native target core adapter sets are registered?
- Do multi-target plugin fixtures prove only the active Web/Cocos/native renderer entry is bundled?
- Does runtime startup fail when more than one target core adapter set is registered?
- Are runtime package native-code payloads rejected at build time and runtime?
- Are native renderer transient resources tracked in the package-aware resource ledger, including CPU/GPU bytes, dependencies, unload blockers, and cleanup paths?
- Do native package unload/release paths use renderer-level unload plans so active frame references block release, and do hosts receive released resource records for native handle cleanup?
