# @quajs/assets

Platform-agnostic asset runtime core for QuaEngine. This package owns bundle parsing, storage-facing cache orchestration, patch application, provider contracts, and byte/text/json APIs. Platform capabilities such as Fetch, IndexedDB, filesystem access, Blob, object URLs, and WebCrypto are supplied by adapters.

## Packages

- `@quajs/assets`: core runtime, no browser or Node platform APIs.
- `@quajs/assets-web`: Fetch, IndexedDB, WebCrypto, Blob/object URL helpers, dev VFS provider, and Vite dev VFS utilities.
- `@quajs/assets-node`: filesystem/http fetcher, filesystem cache, Node crypto, and Node codecs.
- `@quajs/assets-memory`: in-memory fetcher/storage/crypto for tests and lightweight runtimes.

## Quick Start

```typescript
import { QuaAssets } from '@quajs/assets'
import { createMemoryAssetsAdapter } from '@quajs/assets-memory'

const assets = new QuaAssets({
  endpoint: 'memory://assets',
  adapter: createMemoryAssetsAdapter(),
  locale: 'default',
})

await assets.initialize()
await assets.loadBundle('main.qpk')

const bytes = await assets.getBytes('images', 'background.png')
const config = await assets.getJSON<{ title: string }>('data', 'config.json')
```

## Web Runtime

```typescript
import { createWebAssets, getBlobURL, revokeObjectURL } from '@quajs/assets-web'

const assets = createWebAssets({
  endpoint: 'https://cdn.example.com/assets',
  web: {
    databaseName: 'MyGameAssets',
  },
})

await assets.initialize()
await assets.loadBundle('main.qpk')

const url = await getBlobURL(assets, 'images', 'background.png')
document.querySelector<HTMLImageElement>('#bg')!.src = url

revokeObjectURL(url)
```

## Core Constructor

```typescript
interface QuaAssetsOptions {
  endpoint?: string
  adapter: AssetRuntimeAdapter
  provider?: AssetProvider
  locale?: string
  enableCache?: boolean
  cacheSize?: number
  retryAttempts?: number
  timeout?: number
  plugins?: QuaAssetsPlugin[]
}

const options: QuaAssetsOptions = {
  adapter,
}

const assets = new QuaAssets(options)
```

`adapter` is required. The core package does not create a default browser adapter and does not expose Blob/object URL APIs.

## Core APIs

```typescript
await assets.initialize()
await assets.checkLatest()
await assets.loadBundle('main.qpk')

const asset = await assets.getAsset('data', 'config.json')
const bytes = await assets.getBytes('images', 'bg.png')
const text = await assets.getText('scripts', 'scene.js')
const json = await assets.getJSON('data', 'config.json')

await assets.preloadAssets([
  { type: 'images', name: 'bg.png' },
  { type: 'audio', name: 'theme.ogg' },
])

await assets.applyPatch('patch-1-to-2.qpk', 'main')
await assets.cleanup()
```

`getAsset()` returns `AssetData`:

```typescript
interface AssetData {
  id: string
  type: AssetType
  name: string
  bundleName: string
  locale: string
  data: Uint8Array
  mimeType?: string
  hash?: string
  size: number
  version: number
  mtime: number
  fromCache: boolean
}
```

## Adapter Contract

```typescript
interface AssetRuntimeAdapter {
  name: string
  storage: AssetStorage
  fetcher?: AssetFetcher
  crypto: AssetCrypto
  codec?: AssetCodec
  now?: () => number
}
```

Adapters provide platform-specific behavior. For example:

- Web adapter uses Fetch, IndexedDB/Dexie, WebCrypto, and object URL helpers.
- Node adapter uses filesystem/http fetch, filesystem cache, Node crypto, and Node codecs.
- Memory adapter uses in-memory files/storage and a platform-neutral SHA-256 implementation.

## Dev VFS

Development VFS is a Web adapter capability:

```typescript
import { createDevVfsProvider } from '@quajs/assets-web'

const provider = createDevVfsProvider()
const assets = createWebAssets({
  endpoint: '/@qua-assets',
  provider,
})
```

Vite middleware lives under `@quajs/assets-web/vite`; `@quajs/vite-plugin` wires it into Vite.

## Events

```typescript
assets.on('bundle:loading', ({ bundleName }) => {})
assets.on('bundle:progress', ({ bundleName, progress }) => {})
assets.on('bundle:loaded', ({ bundleName, status }) => {})
assets.on('bundle:error', ({ bundleName, error }) => {})
assets.on('asset:changed', (change) => {})
assets.on('cache:full', ({ size, limit }) => {})
assets.on('patch:applied', ({ bundleName }) => {})
```

`asset:changed` is emitted by active providers and can be forwarded by the engine to the renderer through `@quajs/pipeline`.

## Notes

- No backward compatibility is kept for the old Web-only constructor or Blob methods.
- Core code must stay free of `Blob`, `fetch`, `window`, `document`, `URL.createObjectURL`, `crypto.subtle`, `AbortController`, and Dexie.
- Browser-only helpers belong in `@quajs/assets-web`.
