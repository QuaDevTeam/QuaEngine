# @quajs/assets-web

Web adapter for platform-neutral QuaAssets: Fetch, IndexedDB, browser crypto and Blob URLs.

For a large Web project, share persistent byte storage between the engine and renderer asset runtimes:

```ts
const storage = createWebAssetStorage({ databaseName: 'game-assets' })
const assets = await createWebAssetRuntime({
  web: { storage },
  initialBundles: { filename: manifest.bundleFile, expected: manifest.bundleIdentity },
  cacheSize: 256 * 1024 * 1024,
})
```

`cacheSize` is a storage cleanup threshold, not a RAM budget. A mounted package must remain available: do not let eviction delete its only source. Share the same storage instance instead of creating an in-memory copy. Game state and runtime-package unload authority stay with the engine.

Revalidate the deployment manifest first (`fetch(url, { cache: 'no-cache' })`). The expected name/version/build/archive SHA-256 allows complete IndexedDB hits without downloading or decoding the QPK again. Missing cached members trigger repair. Bundle bytes and active metadata are committed in a single transaction; eviction protects active bundles. `onProgress` reports checking-cache/downloading/verifying/caching/ready phases, bytes, package index/count and nullable progress. A null progress value means there is no reliable total, including HTTP-compressed streams.

Mount a resource-free loading scene **before** awaiting initialization/download, using `@quajs/plugin-asset-loading` and `@quajs/renderer-web/plugins/asset-loading`. See [Web resource loading](../../../docs/design/web-asset-loading.md) for startup and lazy dependency-pack integration. Web request inactivity deadlines respect the runtime `timeout` configuration; a failed attempt can be retried through the loading scene.

The default IndexedDB cache schema is3. Its multi-entry `lookupKeys` index resolves canonical names, full paths and suffix aliases without deserializing unrelated image payloads. Opening an existing cache adds these keys to stored asset records. Writes are batched up to8MiB; a larger single asset is written alone. Size/statistics/eviction walk numeric index keys, not image data. Returned byte arrays are temporary consumer data; the adapter does not keep a second JavaScript payload cache.

Object URL ownership belongs to consumers. Official Web/framework renderers use the shared `WebAssetUrlHandle` lifecycle, bounded read concurrency and idle URL budget in `@quajs/renderer-web`. Custom callers of `createObjectURL` must revoke their URLs when unused. `revokeObjectURL` does not guarantee immediate browser image/GPU reclamation.

Initial QPK download and parsing still materialize the complete archive. For content exceeding the project's startup memory allowance, split it into Quack-built packages and mount/unmount through engine APIs; this adapter does not implement streaming/range QPK parsing.

Validation: package tests (including fake-indexeddb), typecheck and build; then actual browser/QPK scene switching and media decoding.
