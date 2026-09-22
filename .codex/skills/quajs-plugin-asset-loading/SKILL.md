---
name: quajs-plugin-asset-loading
description: Define shared Web and Native loading scenes, prepare versioned Web assets and native GPU images, and load dependent QPK packs before narrative continuation.
---

# Asset loading scenes

`@quajs/plugin-asset-loading` owns resource preparation and its engine plugin projection (`asset-loading`). `AssetLoadingPlugin.run(title, task)` keeps a loading scene visible until the awaited task completes. `task(report)` may report bundle phases, bytes, and package index/count. A failed attempt stays visible and pending until `asset-loading/retry` arrives through pipeline. Overlapping runs reject; teardown releases pending continuations. Retry tasks must be idempotent resource preparation. Enter the destination story scene **after** `run` resolves, never inside a retryable task.

Install the plugin before `engine.init()`. Initialize the engine and mount `mountAssetLoadingScene({ container, pipeline, getViewState })` from `@quajs/renderer-web/plugins/asset-loading` before fetching deployment metadata or QPKs. This standalone mount works before Vue/React/Svelte app mounting. The same entry exports `createAssetLoadingWebRendererPlugin({ container })`; framework packages re-export it at `plugins/asset-loading`. Use one mount, not both. Mount outside the framework-owned root and call the disposer on teardown.

The loading surface is a resource-free UI scene, not a narrative scene switch. It preserves the current story point, projects engine-owned progress, isolates input, restores focus/inert state, and emits only retry intent. It does not download assets, decide progression, or persist browser transfer handles. Labels and `.qua-asset-loading*` classes are customizable; visual CSS is explicitly imported by the host. Keep the loading UI's images/fonts out of the remote packs it must load. No QuaScript decorators are introduced; application/bootstrap code or an awaited story step invokes the plugin.

## Web versioned resources

- Vite emits `asset-manifest.json` with `bundleFile` and `bundleIdentity: { name, version, buildNumber, hash, target? }`. Hash is SHA-256 of the complete archive.
- Fetch mutable deployment/workspace indexes with revalidation (`cache: 'no-cache'`). `assets.checkLatest('workspace-index.json')` does this through the injected fetcher.
- Call `assets.loadBundle(file, { expected: bundleIdentity, onState: report })`. Exact identity plus complete stored members permits a disk-cache hit without archive download/decode. Plain filenames alone cannot prove freshness and always fetch.
- `onState` phases: checking-cache, downloading, verifying, caching, ready. `progress: null` means indeterminate. Download is capped at 80%; completion is emitted only after validation and cache commit. Browser gzip/chunked responses may have no reliable decoded byte total.
- `assets.loadWorkspaceBundles(index, names?, { onBundleState: report, target? })` resolves dependencies first; omitted names select immediate packs. Lazy packs load only when requested or required by a dependency. Missing/cyclic dependencies or absent explicit targets fail before downloading.
- Static packs use `loadBundle`/`loadWorkspaceBundles`. Executable Runtime QPKs still use engine `loadRuntimePackage` and its trust/activation/unload controls; wrap that preparation in `run`, retaining signature and provenance checks.
- IndexedDB commits bytes and active metadata atomically, checks membership using keys, and evicts inactive versions before loose LRU records. Mounted versions are protected, so `cacheSize` is a soft disk-cache budget, not a RAM ceiling. Initial download/decode still materializes a whole pack.
- Do not reuse a version/build identity for changed bytes. Do not confuse asset caching with player-save storage or promise whole-site offline availability without an offline app-shell strategy.

## Shared UI and Native preparation

Native startup resources are local. The packaged host reads QPK files from the application's resources; the development host reads the configured local QPK path. Image preparation reads those mounted bytes, decodes them and uploads them to the GPU. Use phase `loading-local` and local-loading wording. Missing/corrupt local resources fail locally; do not add download, browser-cache or remote-fallback behavior. The download/cache phases above apply to Web. Sharing the loading UI does not merge the platform asset loaders.

`createAssetLoadingUiSurfaceFeature(options)` from `@quajs/plugin-asset-loading/surface` returns an optional platform-neutral QUI surface. Register it in Native `featureSurfaces`; pass the same entry to Web `mountAssetLoadingScene({ ..., surface })`. Demo defines this once in `game/ui/features.ts`. Web-only projects may keep the semantic DOM renderer and explicit CSS. The shared surface uses logical stage coordinates, no asset references, product labels/colors/font family, progress and a retry intent. Its Web bootstrap host scales with the common stage resolver, preserves input/focus isolation and disposes its resize observer. Available fonts may be used; do not require fonts from a pack that has not mounted yet.

`await loading.prepareRenderer(title, images)` runs the existing retry lifecycle around Native image decode/GPU residency. Images are `{ assetType: 'images' | 'characters', assetName, provenance? }` QPK references (maximum 12 unique first-scene dependencies). `preparation.id` correlates `asset-loading/renderer-progress` pipeline replies; stale/malformed replies cannot release continuation. Failure remains visible for retry; teardown removes the pending listener. This API requires a supporting Native renderer and the registered surface. Do not call it on a Web renderer without a preparation adapter; Web byte/download tasks still use `run`.

Native runtime packages using `prepareRenderer` must require host capability `native-wgpu.asset-loading@1`. The signed Rust host declares the preparation projection, image asset kinds and renderer-progress intent; do not let QPK metadata override host capabilities. Input isolation must filter player `user/*`, `choice/select` and `ui/intent` actions only (except retry). Continue delivering editor status requests, window lifecycle and renderer readiness replies during loading, including immediately after embedded preview reload.

Start Native preparation without awaiting it in a synchronous JSC bootstrap export. Bootstrap must return the initial loading projection so the host frame loop can service the request; await the promise in the application continuation. Demo prepares its title image while retaining the already-created menu in engine state. Native projects only the resource-free loading scene until completion, then restores that menu without an intermediate empty projection. Loading user input cannot advance the story; retry remains available. Required preparations bypass advisory lookahead admission and remain pinned until the destination adopts them, with one decode/QPK read started per tick. Do not use this API to preload an entire gallery/catalog. Package provenance/path validation and the existing bounded image worker still apply.

Native loading scene entry/exit must clear default presence transitions: a retained exiting menu would otherwise reintroduce its image dependencies, defeating the loading screen. Keep the normal complete-frame presentation gate and transparent missing-image fallback. Fonts and the loader itself must be complete before window reveal. The current Native loader starts after local QPK/JSC initialization; it does not claim to display during synchronous host bootstrap or package mounting.

## Validation

Run tests/typecheck/build for assets, assets-web, plugin-asset-loading, renderer-web and affected framework/build packages. Use fake-indexeddb tests for interrupted publication and metadata-only checks. `demo/scripts/asset-loading-smoke.mjs` runs against production preview on port 4178 (or `QUA_LOADING_TEST_URL`) and checks retry, actual QPK transfer, input blocking and zero archive requests on a second launch. Inspect its screenshots under `.generated/review/asset-loading`. Synthetic/unit tests alone do not prove browser download/cache behavior.

For Native, run `node demo/scripts/native-loading-smoke.mjs` after building changed TS packages. It owns an isolated control port/window, captures cold loading and automatic title entry, and writes `.generated/qa/native-loading`. Also test missing resources/retry, stale acknowledgements, disposal, zero advisory budget, package scopes, loading presence boundaries, title/story navigation and editor embedding. Do not run multiple visible Native acceptance windows concurrently. See `docs/reviews/native-loading-scene-2026-09-22.md`.

Review scene ownership, retry idempotency, dependency order, unknown totals, corrupt/incomplete-cache recovery, hash mismatch handling, version deletion semantics, resource cleanup and explicit host styling.
