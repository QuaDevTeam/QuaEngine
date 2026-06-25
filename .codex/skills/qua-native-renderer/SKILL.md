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
- Native runtime package guards must scan script/plugin/scene/migration asset references, their runtime module variants, plus emitted bundle asset names, paths, relative paths, and variant names/paths for absolute/remote/traversal references and forbidden native payload extensions before QuickJS evaluation. They must also reject package-level and plugin-level native-code declarations such as `nativeBinaries`, `nativePayloads`, `nativeEntry`, or truthy `nativeCode`, not only compatibility metadata.
- Native version/capability data comes from the signed native app/Rust build and is exposed through `QuaNativeHostInfo`; QPK content cannot override it.
- Native runtime package compatibility may be declared as `metadata.nativeRenderer` or target-scoped `metadata.renderers.native`; checks normalize `renderer`/`rendererPackage` to `packageName`, `version`/`rendererVersion` to `versionRange`, and `capabilityIds`/`optionalCapabilityIds` to capability requirement lists before activation. Required `assetKinds`, `qssFeatures`, and `quiComponents` must be checked against host renderer capabilities before activation; optional asset kinds, optional QSS features, and optional QUI components may warn and fall back without blocking activation. Native compatibility blocks must explicitly declare `nativeCode: false`; missing or truthy values are rejected before signature verification or script evaluation.
- Native dynamic module loading must use `createNativeRuntimeModuleLoader` or an equivalent restricted loader. It may load only runtime-package-declared, package-relative JavaScript module-like `assetName` script assets (`.js`, `.mjs`, or `.cjs`) through QuaAssets/native host bytes, then pass code to a trusted Rust/QuickJS evaluator. The loader itself must also reject unsafe runtime module variant asset/module references and native payload-looking extensions as defense in depth, even though trust policy guards run before activation. Do not load runtime modules from filesystem paths, URLs, Node resolution, Web `Blob`, or dynamic `import()`.
- Rust `quajs_native_runtime` QuickJS request validation must mirror the restricted TS loader: package-relative asset names only, JavaScript module-like extensions only (`.js`, `.mjs`, `.cjs`), explicit native-payload rejection, byte limits, and no filesystem/URL/native payload escape hatches before evaluator dispatch.
- When using the native host QuickJS bridge, `moduleNamespaceId` is only an opaque Rust/QuickJS namespace handle. `@quajs/engine-native` must use an explicit namespace resolver before returning a real engine module namespace object; do not fake module exports from the id string.
- Native host QuickJS cleanup APIs (`releaseQuickJsModuleNamespace`, `releaseQuickJsPackageNamespaces`, `getQuickJsNamespaceSummary`, and `getQuickJsPackageNamespaceSummary`) are resource-ledger APIs only. Real hosts must use a persistent `QuickJsModuleNamespaceRegistry` across evaluation/release calls, not a per-request temporary registry, so runtime package unload can release package-owned namespace handles and check memory summaries.
- `@quajs/engine-native` must release package-owned QuickJS namespaces from the late renderer-facing runtime-package unload event (`LogicToRenderEvents.RUNTIME_PACKAGE_UNLOAD`), after runtime engine plugins have been unloaded. It should call `releaseQuickJsPackageNamespaces(packageId)` when the host supports it, so successful QuickJS namespace handles do not outlive their owning Runtime QPK without being released before plugin teardown.
- Rust `quajs_wgpu_renderer` consumes resolved QUI/QSS projection data only. QSS parsing, selector matching, cascade, inheritance, and language-server diagnostics belong in TS/compiler/tooling packages, not in the renderer.

## Package Responsibilities

- `@quajs/native-contracts`: serializable native host, renderer capability, compatibility, QUI/QSS, and target bootstrap contracts. Packagers should use `createTargetCoreSelection` to derive the active Web/Cocos/native resolver identity, core family, and selected adapters from one target value; native packagers should use `createNativeCapabilityManifestPayload` / `createNativeCapabilityManifestHash` with an injected SHA-256 implementation when emitting `nativeRenderer.capabilityManifestHash`; use `createTargetBundleNativeRendererInfo` to derive native target-bundle renderer metadata from the actual renderer capabilities.
- `@quajs/engine-native`: engine plugin/adapter that reads native host info, registers renderer capabilities, supplies runtime package compatibility guards, and exposes the restricted native `RuntimeModuleLoader` over package asset bytes plus a Rust/QuickJS evaluator.
- `@quajs/assets-native`: QuaAssets adapter over native host byte/storage/crypto APIs.
- Native asset hosts should provide `listStorageKeys` when cache roots need full cleanup; `@quajs/assets-native` may fall back to index-known asset deletion when key listing is unavailable, but full orphan cleanup requires host prefix listing.
- `@quajs/store-native`: QuaStore persistence adapter over native host storage APIs.
- Native store hosts must provide `listStorageKeys` when using list or prefix-clear save operations; missing key listing support must fail explicitly instead of making snapshots/save slots appear empty.
- `@quajs/native-ui-compiler`: native QUI/QSS authoring compiler for parse, validation, formatting, completions, hover metadata, component registry, and QSS feature registry. It may depend on platform-neutral contracts only and must not import Web, Cocos, or native runtime bootstrap adapters.
- `@quajs/native-language-server`: standalone `.qui/.qss` LSP adapter over `@quajs/native-ui-compiler`. It is an authoring tool only; it must not load Web/Cocos/native target core bootstrap plugins, ordinary game plugin arrays, or runtime QPK executable dependencies.
- `packages/native/vscode` (`qua-native-authoring` VSCode extension): standalone editor extension for native `.qui/.qss` files. It should start the native LSP, contribute language ids `qua-ui` and `qua-style`, and avoid importing `@quajs/renderer-web`, `@quajs/renderer-cocos`, or native app/runtime bootstrap packages.
- `@quajs/native-benchmarks`: deterministic native authoring/tooling smoke benchmarks. It measures QUI/QSS parse+validate, format, completion, hover, document size, diagnostics, elapsed time, and process memory deltas through `@quajs/native-ui-compiler` and `@quajs/native-language-server` public APIs only. It must not start a renderer, load Web/Cocos/native target core bootstrap adapters, parse ordinary game plugin arrays, access the network, or use randomized fixtures.
- Rust `quajs_native_runtime`: QuickJS host and native host API implementation.
- Rust `quajs_wgpu_renderer`: wgpu projection renderer and transient resource management.

## Target Isolation

Web, Cocos, and native target core adapters must not be mixed:

- Web uses Web assets/renderer/framework adapters only.
- Cocos uses Cocos host/renderer only.
- Native uses `@quajs/engine-native`, `@quajs/assets-native`, `@quajs/store-native`, and Rust native runtime/renderer metadata only.
- Web, Cocos, and native core bootstrap plugins are target roots, not ordinary game plugins. They must not be placed in one shared plugin array, umbrella preset, Runtime QPK executable dependency list, or runtime resolver path that imports every target and chooses one later.
- Web, Cocos, and native packaging must use separate target-core resolver contexts. Shared validation schemas are fine, but a shared all-target core plugin list is invalid even if later filtering appears to remove inactive entries.
- `@quajs/native-contracts` may be used by Web/Cocos build tooling for target validation, but it must not remain in Web/Cocos runtime bundles after tree-shaking.
- Target selection must happen before bootstrap/plugin resolution. Do not build an umbrella app that imports Web, Cocos, and native core plugins and chooses one at runtime.
- Core target plugins are reserved bootstrap infrastructure, not normal game plugins. Do not put Web/Cocos/native bootstrap adapters in ordinary plugin arrays, shared presets, Runtime QPK executable dependencies, or generated plugin resolver paths.
- Quack/native packaging should materialize one read-only `TargetCoreSelection` for `web`, `cocos`, or `native` before resolving normal engine/game plugins. Shared plugin resolution may consume that selection but must not add another target core family. The emitted `target-bundle-manifest.json` must record the matching resolver identity as `targetCoreResolver`: `web-core-resolver`, `cocos-core-resolver`, or `native-core-resolver`.
- Packaging a Web, Cocos, or native project must select exactly one target bootstrap. Target-specific renderer plugin entries and core adapters are not interchangeable between targets.
- Treat the three target bootstrap plugin families as disjoint: `web-core`, `cocos-core`, and `native-core`. Every packaged artifact must record exactly one selected family, and `target`, selected core adapters, renderer entries, and Runtime QPK executable dependencies must all agree with that family.
- Treat target core plugins as release-blocking isolation boundaries. Web artifacts must exclude Cocos/native core adapters, Cocos artifacts must exclude Web/native core adapters, and native artifacts must exclude Web/Cocos core adapters after bundling/tree-shaking, not just in source metadata.
- Shared engine/game/plugin code may be reused across targets only through platform-neutral entries. Shared entries must not eagerly import `@quajs/renderer-web`, `@quajs/renderer-cocos`, `@quajs/engine-native`, `@quajs/assets-native`, `@quajs/store-native`, Cocos host adapters, or native runtime adapters.
- Validate target isolation at three layers: application bootstrap core adapters, target-specific renderer/plugin entries, and Runtime QPK renderer compatibility metadata. Do not let a pass in one layer imply the others are safe.
- Use `validateExclusiveTargetBootstrap` from `@quajs/native-contracts` to assert a packaged app/startup dependency set registers exactly one Web, Cocos, or native bootstrap. Then use `validateTargetBootstrap` for the active target and treat both `missing` required target adapters and `forbidden` cross-target adapters as blockers.
- Use `validateOrdinaryPluginListTargetIsolation` from `@quajs/native-contracts` before ordinary game/plugin resolution. Any Web, Cocos, or native target core root or subentry in `plugins`, shared presets, or generated plugin resolver paths is a blocker; target bootstrap must come only from the active target-core resolver.
- Use `validateTargetPluginManifest` from `@quajs/native-contracts` for third-party and official plugin source metadata before bundle entry selection. Shared plugin entries must import no target core adapters, selected entries must match the active target, inactive target entries must not be eager, and target entries may import only their own target adapters plus shared logic.
- Inactive eager plugin entries must also report any Web/Cocos/native core adapter imports they would pull into the active artifact, so packagers can reject and locate target-core leakage before bundling.
- Use `validateTargetBundleManifest` from `@quajs/native-contracts` for emitted `target-bundle-manifest.json` files. Pass `expectedTarget` from the packaging/runtime context so a manifest declared for Web, Cocos, or native cannot be silently reused by another target. It validates `targetCoreResolver`, the explicit selected core adapter set, normalized runtime dependencies, selected renderer entry targets, Runtime QPK renderer entry targets, Runtime QPK executable dependencies, and target-scoped native renderer metadata together after bundling/tree-shaking.
- Native target bundle validation must reject missing, empty, or invalid artifact metadata required by packaging and startup, including `profile` (`debug`/`release`) and native `platform` (`macos`/`windows`/`linux`).
- Native target bundle validation must reject missing or empty release app metadata required by packaging and startup, including `app.bundleId`, `app.version`, `app.buildNumber`, and `app.icon`.
- Native project packaging metadata should come from the unified Qua project manifest `targets.native`, including `platforms`, `profiles`, `outputDir`, `app.bundleId`, `app.version`, `app.buildNumber`, `app.icon`, native asset target, and build options.
- Quack native packaging should consume `createQuaProjectNativeArtifactPlans` so debug/release outputs are isolated by `outputDir/profile/version-buildNumber/platform` before target-bundle manifests, signing, or distribution artifacts are written.
- Quack packagers should use `emitQuaTargetBundleManifest` to validate and write Web, Cocos, and native `target-bundle-manifest.json` files with the active `expectedTarget`. Native packaging should use `emitQuaProjectNativeTargetBundleManifest` as the native artifact-plan wrapper around the shared emitter.
- Quack/native packaging must emit a post-bundle `target-bundle-manifest.json` for every Web, Cocos, and native debug/release artifact. Validate the emitted manifest after tree-shaking, not just the source dependency set.
- Runtime startup must repeat the exclusive-target assertion before engine initialization so hand-built shells cannot register zero or multiple target core adapter sets. Native startup should use `createNativeEngineBootstrap` and pass the emitted `target-bundle-manifest.json` into its `targetBundleManifest` option when available, falling back to `targetBootstrapPackages` only for lightweight tests or hand-built debug shells. After reading host info, `@quajs/engine-native` must verify emitted app identity/profile/platform metadata plus native renderer package/version/backend/capability ids and capability manifest hash against the actual Rust host info before exposing the plugin as initialized.
- Rust `quajs_native_app` startup must validate native `target-bundle-manifest.json` data before building `NativeHostInfo` or starting QuickJS/engine. It can load the emitted manifest from `QUA_NATIVE_TARGET_BUNDLE_MANIFEST` and should reject unreadable/invalid manifest files, invalid artifact `profile`/`platform` values, mismatched or missing `targetCoreResolver`, app identity/profile/platform mismatches, missing app icon metadata, missing or invalid `nativeRenderer` package/version/backend/capability metadata, foreign Web/Cocos core roots, non-native renderer entry targets, and Runtime QPK target-core executable/renderer entries before host-info construction. After constructing host info, it must compare emitted renderer package/version/backend/capability ids and capability manifest hash against the actual Rust host info before QuickJS or engine startup.
- Validate package subentries by normalized package root; for example `@quajs/renderer-web/plugins/audio` is still Web core, and must not appear in native/Cocos bundles.
- Shared plugin entries must not import Web, Cocos, or native core adapters. Target entries may import only their own target adapters plus platform-neutral shared logic.
- Multi-target plugin packages may declare Web, Cocos, and native entries in source metadata, but packaging must include only the active target entry and reject accidental imports of inactive target entries.
- Renderer entry records that carry target metadata must match the artifact target. A Web/Cocos/native artifact must fail validation if an app renderer entry or Runtime QPK renderer entry declares another target, even when the entry comes from a third-party plugin package rather than an official core adapter package.
- Runtime QPKs may declare compatibility with Web, Cocos, and native, but inactive target blocks are metadata only. They must not carry executable dependencies on target core adapters, install target bootstrap plugins, or activate another target bootstrap.
- Runtime package guard must reject `executableDependencies` and `rendererEntries` that normalize to any Web, Cocos, or native target core adapter root, including target subentries such as `@quajs/renderer-web/plugins/audio`, `@quajs/renderer-cocos/plugins/dialogue`, or `@quajs/engine-native/runtime`.
- Dynamic QPK activation must evaluate only the active artifact target block. A Web build ignores native/Cocos compatibility blocks, a Cocos build ignores Web/native blocks, and a native build ignores Web/Cocos blocks while still rejecting native-code payloads for native.
- Every packaged debug/release artifact should emit a target bundle manifest and run dependency graph checks so Web builds exclude Cocos/native core adapters, Cocos builds exclude Web/native core adapters, and native builds exclude Web/Cocos core adapters.
- Runtime startup should assert exactly one target adapter set registered with the engine, so hand-built bundles cannot mix Web, Cocos, and native core plugins.
- Implement target core plugin resolution in this order: normalize target, select exactly one bootstrap preset, materialize that target's adapters/renderer/host bridge, resolve shared engine/game plugins, select active third-party target entries, bundle/tree-shake, emit `target-bundle-manifest.json`, validate it, then assert it again at runtime startup.
- Implement target core plugin resolution through target-specific functions or contexts such as Web-only, Cocos-only, and native-only resolvers. Do not let debug/release/updater/installer paths bypass the same emitted manifest validation.
- Run the same source selection, renderer entry, post-bundle graph, runtime startup, and Runtime QPK gates for all three targets. Native cannot be the only strict path; Web and Cocos builds must reject native core adapters with the same severity that native builds reject Web/Cocos adapters.
- Test target isolation symmetrically. Web fixtures must reject Cocos/native leakage, Cocos fixtures must reject Web/native leakage, and native fixtures must reject Web/Cocos leakage. Native-only rejection tests are not enough.

Shared engine/game/plugin packages may be reused only when platform-neutral.

## QUI/QSS Projection

- Inline QUI surface nodes are renderer projections, not authoritative UI state.
- Supported foundational QUI node kinds are `Fragment`, `Box`, `Stack`, `Row`, `Column`, `Grid`, `Backdrop`, `Button`, `Divider`, `Layer`, `SafeArea`, `Spacer`, `Text`, `RichText`, `Image`, `Panel`, and `Scroll`; higher-level components such as dialog, drawer, save/load panels, gallery, and settings should compose from these base nodes.
- QUI authoring supports declarative conditional and loop directives in compiler/tooling only. `else-if` / `else` branches must be adjacent to an active conditional chain, duplicate directives on one node are invalid, `for` supports `item in source` and `(item, index) in source`, and loop-rendered nodes must declare a stable `key` so native renderers never infer list identity.
- QUI component registry entries must declare a content model (`children`, `text`, or `none`). Compiler/LSP diagnostics should reject nested QUI components inside `Text`/`RichText`, child content inside no-content leaves such as `Image`/`Divider`/`Spacer`, orphaned named slots, unknown parent slots, and duplicate slot blocks before Rust receives a projection tree.
- Native QUI hover metadata should come from the same component registry and expose content model, slots, and style parts instead of duplicating component documentation in the VSCode extension.
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
- Current native resolved QSS style fields are `background-color`, `border-color`, `border-radius`, `border-width`, `color`, `font-family`, `font-size`, `font-weight`, `line-height`, `text-align`, `object-fit`, and `opacity`.
- Do not add QSS selector parsing or CSS cascade logic to `quajs_wgpu_renderer`; add those to the dedicated QSS compiler/language-server/tooling layer and emit resolved projection fields for native rendering.
- Native capability manifests must declare any consumed QSS features and QUI components so runtime packages can check compatibility before activation.
- The `native-wgpu.ui.surface@1` capability must declare the declarative asset kinds it can consume, including `qui`, `qss`, and `tokens`, so dynamic QPK compatibility metadata matches the renderer resource ledger for `UiAst`, `QssStyle`, and `TokenTable`.
- Native media capability ids must describe implemented projection/resource contracts precisely. Do not declare QUI media components, real video decode, or audio playback capability until the Rust projection path and backend support exist; fallback-only video/audio capabilities should use deterministic `warn-once` semantics.
- Current UI/QSS resource tracking in `quajs_wgpu_renderer` records package-aware `UiAst`, `QssStyle`, and `TokenTable` entries with deterministic labels and conservative CPU-byte estimates for memory ledger, budget, renderer resource metrics, frame resource sync summaries, package unload summaries, and host cleanup records. Asset planning, frame metrics, renderer resource metrics with package breakdowns, frame resource sync summaries, package release summaries, host cleanup records, `native.package_release.summary.smoke`, and `native.frame_resource_replacement.summary.smoke` benchmark output identify declarative asset/resource load, release, replacement-cleanup, and unload-block pressure so dynamic QUI/QSS/token package resident memory can be benchmarked separately from image/audio/media resources. These are internal resource-ledger estimates only; real host/backend-reported resource memory must be preserved when available.
- Current video work in `quajs_wgpu_renderer` is poster/fallback rendering only: video background projections emit video draw commands with fallback reasons and poster image asset requests, and prepared frame/backend submission metrics report fallback counts by video/pipeline/reason plus owner/required package provenance for dynamic QPK attribution. Renderer metrics expose `fallbacks_by_owner_package` and `fallbacks_by_required_package`; backend submission diagnostics expose the same provenance per fallback warning. This is not real video decode support.
- Current audio work in `quajs_wgpu_renderer` is renderer-local resource tracking and backend command planning only: projected tracks may create `AudioBuffer`, `AudioStream`, and `AudioHandle` records, audio asset request plans, cleanup records, memory summaries, unload blockers, audio-specific resource metrics, renderer-local active backend track metrics, and `LoadAsset`/`StartTrack`/`UpdateTrack`/`StopTrack`/`ReleaseHandle` plans for a future `NativeAudioBackend`. `NativeRenderer` may explicitly apply those plans to an injected backend, must send teardown `StopTrack`/`ReleaseHandle` plans before clear when that backend is active, and may send package-scoped teardown plans before releasing inactive package-owned audio resources. `NullNativeAudioBackend` may record plans for tests. This is not playback support and must not be surfaced as `native-wgpu.audio@1` before a real decoder/mixer/device backend is implemented.

## Validation

Prefer light checks while disk is tight:

```bash
pnpm --filter @quajs/native-contracts typecheck
pnpm --filter @quajs/engine-native typecheck
pnpm --filter @quajs/assets-native typecheck
pnpm --filter @quajs/store-native typecheck
pnpm --filter @quajs/native-ui-compiler test -- --run
pnpm -C packages/native/ui-compiler typecheck
pnpm --filter @quajs/native-language-server test -- --run
pnpm -C packages/native/language-server typecheck
pnpm -C packages/native/vscode typecheck
pnpm -C packages/native/vscode build
pnpm -C packages/native/benchmarks typecheck
pnpm -C packages/native/benchmarks test
pnpm --filter @quajs/native-benchmarks bench:smoke
cargo test --manifest-path packages/native/Cargo.toml --workspace
cargo test --manifest-path packages/native/Cargo.toml -p quajs_wgpu_renderer --features bench-smoke
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
- Does `@quajs/engine-native` route runtime package `assetKinds`, `qssFeatures`, and `quiComponents` compatibility metadata through the native trust policy before signature verification and QuickJS module loading?
- Does `@quajs/engine-native` use a restricted runtime module loader that reads package script assets and delegates only to the Rust/QuickJS evaluator, without filesystem, network, Blob, or dynamic import paths?
- Do native QuickJS release/summary host APIs use a persistent package-aware namespace registry, and does `@quajs/engine-native` call those APIs only as cleanup/query helpers rather than treating namespace ids as module exports?
- Do assets/store adapters preserve core contracts without Web/Node assumptions?
- Are Web/Cocos/native target core adapters isolated?
- Does the post-bundle dependency manifest prove the active artifact contains exactly one target core plugin set?
- Does packaging use separate Web, Cocos, and native target-core resolver contexts rather than one shared all-target plugin list?
- Do `targetCoreResolver` and `selectedCorePluginFamily` match the artifact target, selected adapters, renderer entries, and Runtime QPK executable dependencies?
- Does `validateTargetBundleManifest` pass for the emitted Web/Cocos/native artifact, including Runtime QPK executable dependency and renderer entry checks?
- Is `target-bundle-manifest.json` emitted and validated for both debug and release artifacts after bundling/tree-shaking?
- Does runtime startup repeat the exclusive Web/Cocos/native bootstrap assertion before engine initialization?
- Does Rust native app startup validate the emitted target-bundle manifest before constructing host info or starting QuickJS/engine?
- Are target isolation checks applied separately to bootstrap core adapters, renderer/plugin entries, and Runtime QPK compatibility metadata?
- Does plugin source metadata pass `validateTargetPluginManifest` before Web/Cocos/native entry selection?
- Do shared plugin entries avoid importing target adapters, and do target entries avoid importing other target entries?
- Do Runtime QPKs avoid executable dependencies and renderer entries on Web/Cocos/native core adapters?
- Do bootstrap tests cover Web, Cocos, and native core package sets without cross-target leakage?
- Do exclusive bootstrap tests fail when zero or multiple Web/Cocos/native target core adapter sets are registered?
- Do multi-target plugin fixtures prove only the active Web/Cocos/native renderer entry is bundled?
- Does runtime startup fail when more than one target core adapter set is registered?
- Are runtime package native-code payloads rejected at build time and runtime?
- Are native renderer transient resources tracked in the package-aware resource ledger, including CPU/GPU bytes, dependencies, unload blockers, and cleanup paths?
- If touching audio, is the change still renderer-local resource/projection tracking unless a real backend and capability contract are implemented?
- Do native package unload/release paths use renderer-level unload plans so active frame references block release, and do hosts receive released resource records for native handle cleanup?
- Does Rust QuickJS evaluation register successful module namespace handles in the package-aware namespace registry and release package-owned namespaces during runtime package unload/teardown?
