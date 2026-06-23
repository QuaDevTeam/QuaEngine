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
- Packaging a Web, Cocos, or native project must select exactly one target bootstrap. Target-specific renderer plugin entries and core adapters are not interchangeable between targets.
- Use `validateTargetBootstrap` from `@quajs/native-contracts` for release/build/startup isolation checks. Treat both `missing` required target adapters and `forbidden` cross-target adapters as blockers.
- Validate package subentries by normalized package root; for example `@quajs/renderer-web/plugins/audio` is still Web core, and must not appear in native/Cocos bundles.
- Every packaged debug/release artifact should emit a target bundle manifest and run dependency graph checks so Web builds exclude Cocos/native core adapters, Cocos builds exclude Web/native core adapters, and native builds exclude Web/Cocos core adapters.

Shared engine/game/plugin packages may be reused only when platform-neutral.

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
- Are native renderer version/capability checks performed before dynamic package JS evaluation?
- Does `@quajs/engine-native` install `createNativeRuntimeTrustPolicy` so runtime native-code payload guards run before QuickJS module loading?
- Do assets/store adapters preserve core contracts without Web/Node assumptions?
- Are Web/Cocos/native target core adapters isolated?
- Do bootstrap tests cover Web, Cocos, and native core package sets without cross-target leakage?
- Are runtime package native-code payloads rejected at build time and runtime?
- Are native renderer transient resources tracked in the package-aware resource ledger, including CPU/GPU bytes, dependencies, unload blockers, and cleanup paths?
