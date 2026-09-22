# Web resource loading

Resource loading is a UI scene supplied by `@quajs/plugin-asset-loading`. It is independent of the narrative scene: preparing the next chapter must not alter the current story point, save, choice or replay position. The application awaits preparation and then enters the destination scene.

Initialize the engine and its loading plugin before remote resource preparation. The loading surface uses text, native progress and a retry button, with local host CSS. It requires no QPK images or fonts. The Demo mounts this surface before reading its deployment manifest, and displays a small HTML status while the JavaScript entry itself loads.

```ts
import { AssetLoadingPlugin } from '@quajs/plugin-asset-loading'
import { mountAssetLoadingScene } from '@quajs/renderer-web/plugins/asset-loading'

const loading = new AssetLoadingPlugin()
engine.use(loading)
await engine.init()
const dispose = mountAssetLoadingScene({
  container: document.body,
  pipeline: engine.getPipeline(),
  getViewState: () => engine.getViewState(),
})

await loading.run('Preparing chapter two', async (report) => {
  const assets = engine.getAssets()
  const index = await assets.checkLatest('workspace-index.json')
  if (!('bundles' in index)) throw new Error('Expected a workspace index')
  await assets.loadWorkspaceBundles(index, ['chapter-two'], {
    onBundleState: report,
  })
})
// Enter the destination scene here. Dispose the surface when its host is destroyed.
```

`createAssetLoadingWebRendererPlugin({ container })` provides the same surface to a renderer plugin host. Web, Vue, React and Svelte expose `plugins/asset-loading`. Use either this plugin or the standalone mount. The host supplies visual styles and may translate phase/retry/error labels; selectors start with `.qua-asset-loading`. The engine plugin owns state; the renderer sends `asset-loading/retry` through pipeline. Failures keep the returned promise pending so story continuation cannot proceed accidentally. Retry only idempotent preparation, and tear down the plugin to release a pending retry.

Progress distinguishes cache inspection, transfer, integrity verification and local publication. Unknown byte totals show an indeterminate meter and received bytes. HTTP compression may make Content-Length unsuitable for the decoded stream. A full download reaches 80%, cache publication 90%, and only successful completion reaches 100%. For multiple packs the package counter and progress refer to the current pack.

## Deployment identities and cache publication

The Vite deployment manifest carries the emitted immutable filename plus `bundleIdentity` (`name`, numeric `version`, `buildNumber`, archive SHA-256 `hash`, optional artifact `target`). Alternative Web targets have separate cache identities even within the same build. Revalidate the mutable manifest on every launch. Pass this identity as `loadBundle`'s `expected` option, or use a `{ filename, expected }` entry in `createWebAssetRuntime.initialBundles`. Unversioned filename requests cannot establish freshness and fetch again.

Before downloading, QuaAssets checks the exact version/hash and all committed member keys. A complete match avoids both network archive transfer and archive parsing. An incomplete cache is repaired from the archive. New bytes must match the deployment identity and each declared member hash. Changed content under an existing version/build is rejected; publishers must issue a new build.

IndexedDB publishes all bytes and active metadata in a transaction. An interrupted or quota-failed multi-batch write leaves the previous version active. New-version lookup cannot fall back to files deleted by that version. Cleanup removes inactive versions and loose LRU records while protecting active packs. The cache budget is therefore soft when the active working set is larger. Application saves use a separate storage database.

Quack workspaces provide immediate/lazy packs, dependencies and explicit artifact targets. The runtime validates the full requested dependency graph before transfer, loads dependencies first, and deduplicates concurrent identical static bundle requests without caller cancellation signals. Pack IDs are canonical workspace names; translated display names are presentation metadata. Runtime QPK code/plugin activation continues through RuntimeContentManager with its trust and provenance rules.

Deploy new immutable artifacts before publishing the new mutable index. Set revalidation headers on indexes and long immutable caching on versioned archives; custom service workers must honor that distinction. A cached archive does not make HTML/JS or the mutable index available offline. Archive parsing currently materializes an entire QPK in memory, so use bounded packs for large games. The Demo currently uses its existing single static pack; the workspace API handles authored split packs without changing their content layout.

## Verification

Coverage includes cache-only reopening, absent-member repair, hash mismatch, immutable identity enforcement, version removal, concurrent loads, immediate/lazy dependencies, missing/cyclic dependencies, IndexedDB transaction rollback and eviction, renderer input/focus cleanup, and retry continuation. The production Demo smoke downloads its real QPK, forces a failed first request, retries under throttling, then forbids all archive requests during a second launch. This verifies browser caching and decoded assets in the production path; it does not certify a particular CDN or promise streaming/range QPK decoding.
