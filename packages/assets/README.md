# @quajs/assets

Browser-based asset manager for QuaEngine that loads and manages Quack bundles with IndexedDB storage, progressive loading, and plugin extensibility.

## Features

- 🗃️ **IndexedDB Storage** - Efficient local caching with automatic cache management
- 📦 **Bundle Support** - Load ZIP and QPK bundles created by Quack bundler
- 🌍 **Locale Management** - Automatic locale fallback and multi-language support
- 🔧 **Patch System** - Apply incremental updates with automatic diff resolution
- 🚀 **JavaScript Execution** - Execute JS assets with controlled scope and export capture
- 🔌 **Plugin System** - Extensible architecture for custom processing
- 📊 **Progress Tracking** - Real-time loading progress and status events
- ⚡ **Performance Optimized** - Blob URLs, caching, and efficient asset retrieval

## Installation

```bash
pnpm add @quajs/assets
```

## Quick Start

```typescript
import { QuaAssets } from '@quajs/assets'

// Initialize asset manager
const assets = new QuaAssets('https://cdn.example.com/assets')
await assets.initialize()

// Check for updates
const index = await assets.checkLatest()
console.log('Latest version:', index.currentVersion)

// Load a bundle
await assets.loadBundle('game-core.qpk')

// Get assets
const backgroundImage = await assets.getBlobURL('images', 'background.png')
const gameScript = await assets.executeJS('main.js')
const audioBuffer = await assets.getArrayBuffer('audio', 'theme.mp3')

// Set locale
assets.setLocale('ja-jp')
const localizedUI = await assets.getBlob('images', 'ui-text.png')
```

## API Reference

### Core Methods

#### `new QuaAssets(endpoint, config?)`

Create a new QuaAssets instance.

```typescript
const assets = new QuaAssets('https://cdn.example.com/assets', {
  locale: 'en-us',
  enableCache: true,
  cacheSize: 100 * 1024 * 1024, // 100MB
  retryAttempts: 3,
  timeout: 30000,
  plugins: [new XORDecryptionPlugin('secret-key')]
})
```

#### `initialize(): Promise<void>`

Initialize the asset manager (required before use).

```typescript
await assets.initialize()
```

#### `checkLatest(): Promise<BundleIndex | WorkspaceBundleIndex>`

Check latest version info from remote index.json.

```typescript
const index = await assets.checkLatest()

if ('workspace' in index) {
  // Multi-bundle workspace
  console.log('Workspace:', index.workspace.name)
  console.log('Bundles:', Object.keys(index.bundles))
} else {
  // Single bundle
  console.log('Version:', index.currentVersion)
  console.log('Latest bundle:', index.latestBundle.filename)
}
```

#### `loadBundle(bundleName, options?): Promise<void>`

Load a bundle from the remote endpoint.

```typescript
// Basic loading
await assets.loadBundle('game-core.qpk')

// With options
await assets.loadBundle('game-levels.zip', {
  force: true, // Force reload even if cached
  onProgress: (loaded, total) => {
    console.log(`Progress: ${(loaded/total*100).toFixed(1)}%`)
  }
})
```

### Asset Retrieval

#### `getBlob(type, name, options?): Promise<Blob>`

Get asset as Blob.

```typescript
const imageBlob = await assets.getBlob('images', 'character.png')
const audioBlob = await assets.getBlob('audio', 'sound-effect.wav', {
  locale: 'ja-jp',
  bundleName: 'audio-bundle'
})
```

#### `getBlobURL(type, name, options?): Promise<string>`

Get asset as Blob URL (for use in HTML elements).

```typescript
const imageUrl = await assets.getBlobURL('images', 'background.jpg')
document.getElementById('bg').src = imageUrl

// Automatic cleanup when QuaAssets is destroyed
```

#### `getText(type, name, options?): Promise<string>`

Get asset as text content.

```typescript
const csvData = await assets.getText('data', 'characters.csv')
const shaderCode = await assets.getText('scripts', 'vertex-shader.glsl')
```

#### `getJSON<T>(type, name, options?): Promise<T>`

Get asset as parsed JSON.

```typescript
interface GameConfig {
  version: string
  settings: Record<string, any>
}

const config = await assets.getJSON<GameConfig>('data', 'config.json')
console.log('Game version:', config.version)
```

#### `executeJS(name, options?): Promise<JSExecutionResult>`

Execute JavaScript asset and get exports.

```typescript
const result = await assets.executeJS('game-logic.js')

if (result.error) {
  console.error('Script execution failed:', result.error)
} else {
  console.log('Exports:', result.exports)
  console.log('Execution time:', result.executionTime, 'ms')
  
  // Use exported functions
  result.exports.initializeGame()
}
```

### Batch Operations

#### `getBlobBatch(type, names, options?): Promise<Map<string, Blob>>`

Get multiple assets efficiently.

```typescript
const images = await assets.getBlobBatch('images', [
  'ui-button.png',
  'ui-panel.png',
  'ui-icon.png'
])

for (const [name, blob] of images) {
  console.log(`Loaded ${name}: ${blob.size} bytes`)
}
```

#### `preloadAssets(requests): Promise<void>`

Preload assets for better performance.

```typescript
await assets.preloadAssets([
  { type: 'images', name: 'loading-screen.png' },
  { type: 'audio', name: 'menu-music.mp3' },
  { type: 'scripts', name: 'ui-controller.js' }
])
```

### Locale Management

#### `setLocale(locale): void`

Set current locale for asset loading.

```typescript
assets.setLocale('ja-jp')

// All subsequent asset requests will prefer Japanese locale
const localizedText = await assets.getBlob('images', 'menu-text.png')
```

#### `getLocale(): string`

Get current locale.

```typescript
console.log('Current locale:', assets.getLocale())
```

### Bundle Management

#### `getBundleStatus(bundleName): BundleStatus | undefined`

Get loading status of a specific bundle.

```typescript
const status = assets.getBundleStatus('game-core.qpk')
if (status) {
  console.log(`Bundle ${status.name}: ${status.state}`)
  console.log(`Progress: ${(status.progress * 100).toFixed(1)}%`)
  console.log(`Assets: ${status.loadedAssets}/${status.assetCount}`)
}
```

#### `getAllBundleStatuses(): Map<string, BundleStatus>`

Get status of all loaded bundles.

```typescript
const allStatuses = assets.getAllBundleStatuses()
for (const [bundleName, status] of allStatuses) {
  console.log(`${bundleName}: ${status.state} (v${status.version})`)
}
```

### Cache Management

#### `clearBundleCache(bundleName): Promise<void>`

Clear cache for specific bundle.

```typescript
await assets.clearBundleCache('old-bundle.qpk')
```

#### `clearAllCache(): Promise<void>`

Clear all cached data.

```typescript
await assets.clearAllCache()
```

#### `getCacheStats(): Promise<object>`

Get cache statistics.

```typescript
const stats = await assets.getCacheStats()
console.log('Database:', stats.database.totalAssets, 'assets')
console.log('Total size:', (stats.totalSize / 1024 / 1024).toFixed(1), 'MB')
console.log('Asset manager cache:', stats.assetManager.blobUrls, 'blob URLs')
```

## Event Handling

QuaAssets emits events for monitoring loading progress and status changes.

```typescript
// Bundle loading events
assets.on('bundle:loading', ({ bundleName }) => {
  console.log(`Loading bundle: ${bundleName}`)
})

assets.on('bundle:progress', ({ bundleName, progress }) => {
  console.log(`${bundleName}: ${(progress * 100).toFixed(1)}%`)
})

assets.on('bundle:loaded', ({ bundleName, status }) => {
  console.log(`Bundle loaded: ${bundleName} (${status.assetCount} assets)`)
})

assets.on('bundle:error', ({ bundleName, error }) => {
  console.error(`Bundle error: ${bundleName}`, error)
})

// Cache events
assets.on('cache:full', ({ size, limit }) => {
  console.log(`Cache full: ${size}/${limit} bytes, cleaning up...`)
})

assets.on('patch:applied', ({ bundleName, fromVersion, toVersion }) => {
  console.log(`Patch applied: ${bundleName} v${fromVersion} → v${toVersion}`)
})
```

## Patch System

QuaAssets supports applying incremental patches created by Quack.

```typescript
// Load patch manager
import { PatchManager } from '@quajs/assets'

const patchManager = new PatchManager(assets.database, assets.bundleLoader)

// Check available patches
const patches = await patchManager.getAvailablePatches(
  'https://cdn.example.com/assets',
  'game-core',
  2 // current version
)

console.log('Available patches:', patches)

// Preview patch changes
const preview = await patchManager.previewPatch(
  'https://cdn.example.com/assets/patch-2-to-3.qpk',
  'game-core'
)

console.log('Patch will:')
console.log(`- Add ${preview.changes.willAdd.length} files`)
console.log(`- Modify ${preview.changes.willModify.length} files`)
console.log(`- Delete ${preview.changes.willDelete.length} files`)

// Apply patch
const result = await patchManager.applyPatch(
  'https://cdn.example.com/assets/patch-2-to-3.qpk',
  'game-core'
)

if (result.success) {
  console.log('Patch applied successfully!')
} else {
  console.error('Patch failed:', result.errors)
}
```

## Plugin System

Extend QuaAssets functionality with plugins.

### Built-in Plugins

```typescript
import {
  XORDecryptionPlugin,
  AESDecryptionPlugin,
  ImageProcessingPlugin,
  CacheWarmingPlugin
} from '@quajs/assets'

const assets = new QuaAssets('https://cdn.example.com/assets', {
  plugins: [
    // Decrypt bundles with XOR encryption
    new XORDecryptionPlugin(process.env.ASSETS_KEY),
    
    // Process images for optimization
    new ImageProcessingPlugin({
      enableWebP: true,
      quality: 0.8
    }),
    
    // Warm cache for frequently used assets
    new CacheWarmingPlugin(50 * 1024 * 1024) // 50MB cache
  ]
})
```

### Custom Plugins

Create custom plugins for specialized needs:

```typescript
import type { AssetProcessingPlugin, StoredAsset } from '@quajs/assets'

class CustomAssetPlugin implements AssetProcessingPlugin {
  name = 'custom-processor'
  version = '1.0.0'
  supportedTypes = ['data']

  async processAsset(asset: StoredAsset): Promise<StoredAsset> {
    if (asset.name.endsWith('.encrypted')) {
      // Custom decryption logic
      const decryptedBlob = await this.decrypt(asset.blob)
      return {
        ...asset,
        blob: decryptedBlob,
        name: asset.name.replace('.encrypted', '')
      }
    }
    return asset
  }

  private async decrypt(blob: Blob): Promise<Blob> {
    // Your custom decryption implementation
    return blob
  }
}

// Register plugin
const assets = new QuaAssets('https://cdn.example.com/assets', {
  plugins: [new CustomAssetPlugin()]
})
```

## Multi-Bundle Workspaces

QuaAssets supports multi-bundle workspaces for progressive loading:

```typescript
// Check workspace index
const index = await assets.checkLatest()

if ('workspace' in index) {
  console.log(`Workspace: ${index.workspace.name}`)
  
  // Load bundles by priority
  const bundles = Object.values(index.bundles)
    .sort((a, b) => a.priority - b.priority)
  
  for (const bundle of bundles) {
    if (bundle.loadTrigger === 'immediate') {
      console.log(`Loading immediate bundle: ${bundle.name}`)
      await assets.loadBundle(bundle.latestBundle.filename)
    }
  }
  
  // Game can start now with core assets
  startGame()
  
  // Load lazy bundles in background
  for (const bundle of bundles) {
    if (bundle.loadTrigger === 'lazy') {
      console.log(`Loading lazy bundle: ${bundle.name}`)
      assets.loadBundle(bundle.latestBundle.filename)
        .catch(error => console.warn(`Failed to load ${bundle.name}:`, error))
    }
  }
}
```

## Advanced Configuration

### Service Worker Integration

```typescript
const assets = new QuaAssets('https://cdn.example.com/assets', {
  enableServiceWorker: true, // Use service worker for caching
  enableCompression: true,   // Enable response compression
  enableIntegrityCheck: true // Verify asset hashes
})
```

### Custom IndexedDB Settings

```typescript
const assets = new QuaAssets('https://cdn.example.com/assets', {
  indexedDBName: 'MyGameAssets',
  indexedDBVersion: 2,
  cacheSize: 200 * 1024 * 1024 // 200MB cache
})
```

### Error Handling

```typescript
import { BundleLoadError, AssetNotFoundError, IntegrityError } from '@quajs/assets'

try {
  await assets.loadBundle('game-bundle.qpk')
} catch (error) {
  if (error instanceof BundleLoadError) {
    console.error('Bundle loading failed:', error.bundleName, error.message)
  } else if (error instanceof AssetNotFoundError) {
    console.error('Asset not found:', error.assetType, error.assetName)
  } else if (error instanceof IntegrityError) {
    console.error('Integrity check failed:', error.expectedHash, error.actualHash)
  }
}
```

## Best Practices

### 1. Initialize Early
```typescript
// Initialize as early as possible
const assets = new QuaAssets('https://cdn.example.com/assets')
await assets.initialize()
```

### 2. Preload Critical Assets
```typescript
// Preload essential assets during loading screen
await assets.preloadAssets([
  { type: 'images', name: 'ui-critical.png' },
  { type: 'scripts', name: 'core-logic.js' }
])
```

### 3. Handle Locales Properly
```typescript
// Set locale before loading assets
assets.setLocale(getUserLocale())

// Always provide fallbacks
const text = await assets.getBlob('images', 'menu-text.png')
  .catch(() => assets.getBlob('images', 'menu-text.png', { locale: 'default' }))
```

### 4. Monitor Cache Usage
```typescript
// Periodically check cache size
setInterval(async () => {
  const stats = await assets.getCacheStats()
  if (stats.totalSize > 150 * 1024 * 1024) { // 150MB
    console.log('Cache getting large, consider cleanup')
  }
}, 60000)
```

### 5. Proper Cleanup
```typescript
// Clean up on page unload
window.addEventListener('beforeunload', async () => {
  await assets.cleanup()
})
```

## Performance Tips

- Use `getBlobURL()` for assets that will be used in HTML elements
- Preload frequently accessed assets with `preloadAssets()`
- Set appropriate cache size limits based on target devices
- Use lazy loading for non-critical bundles
- Monitor cache statistics to optimize storage usage
- Leverage service workers for better caching in production

## License

Apache-2.0 - see LICENSE file for details