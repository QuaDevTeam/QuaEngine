# @quajs/quack

> Advanced asset bundler for QuaEngine - Pack, optimize, and manage game assets with ease

## Features

- 🎮 **Game-First Design** - Built specifically for visual novel and game asset management
- 📦 **Multiple Bundle Formats** - Support for ZIP and custom QPK formats
- 🖼️ **Media Metadata Extraction** - Automatic extraction of dimensions, duration, and format info
- 🗜️ **Advanced Compression** - LZMA and Deflate compression with configurable levels
- 🧩 **Image Optimization** - Real PNG/JPEG/WebP/AVIF recompression via sharp, built-in PNG lossless recompression, and optional pngquant support
- 🔐 **Asset Encryption** - XOR and custom encryption plugin support
- 🌍 **Localization Support** - Multi-language asset detection and organization
- 📊 **Patch Generation** - Incremental updates and version management
- 🧩 **Runtime QPK Metadata** - Dynamic runtime package manifests for scripts, scenes, plugins, story graph deltas, and store migrations
- 🔏 **Runtime Signing** - ECDSA runtime QPK signing and verification for production trust policies
- 🔧 **Plugin System** - Extensible architecture with custom processing plugins
- 🏢 **Workspace Mode** - Multi-bundle project management
- 🚀 **Node.js Optimized** - Built for server-side asset processing workflows

## Installation

```bash
# Using pnpm (recommended)
pnpm add @quajs/quack

# Using npm
npm install @quajs/quack

# Using yarn
yarn add @quajs/quack
```

## Quick Start

### Basic Bundle Creation

```typescript
import { QuackBundler } from '@quajs/quack'

const bundler = new QuackBundler({
  source: './assets',
  output: './dist/game.zip',
  format: 'zip',
  compression: {
    algorithm: 'deflate',
    level: 6
  }
})

const result = await bundler.bundle()
console.log(`Bundle created: ${result.manifest.totalFiles} files, ${result.manifest.totalSize} bytes`)
```

### Media Metadata Extraction

```typescript
import { MediaMetadataExtractor } from '@quajs/quack'

const extractor = new MediaMetadataExtractor()

// Extract image metadata
const imageMetadata = await extractor.extractMetadata('./assets/background.png')
console.log(`Image: ${imageMetadata.width}x${imageMetadata.height}, aspect ratio: ${imageMetadata.aspectRatio}`)

// Extract audio metadata
const audioMetadata = await extractor.extractMetadata('./assets/bgm.mp3')
console.log(`Audio: ${audioMetadata.duration}s, format: ${audioMetadata.format}`)
```

### Asset Discovery with Metadata

```typescript
import { AssetDetector } from '@quajs/quack'

const detector = new AssetDetector()
const assets = await detector.discoverAssets('./assets')

// Assets automatically include media metadata
assets.forEach((asset) => {
  console.log(`${asset.name}: ${asset.type}`)
  if (asset.mediaMetadata) {
    console.log(`  Metadata:`, asset.mediaMetadata)
  }
})
```

## Configuration

### Bundle Configuration

```typescript
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './src/assets',
  output: './dist',
  format: 'qpk', // or 'zip'

  compression: {
    algorithm: 'lzma', // 'none', 'deflate', 'lzma'
    level: 9 // 1-9 for deflate, 1-9 for lzma
  },

  encryption: {
    enabled: true,
    algorithm: 'xor', // 'none', 'xor', 'custom'
    key: process.env.ENCRYPTION_KEY
  },

  versioning: {
    incrementVersion: true,
    buildNumber: process.env.BUILD_NUMBER
  },

  ignore: [
    '**/*.tmp',
    '**/.*',
    'node_modules/**'
  ]
})
```

### Workspace Configuration

For multi-bundle projects, use `quack.workspace.ts` (or `.js` / `.json`):

```typescript
// quack.workspace.ts
export default {
  name: 'my-game',
  version: '1.0.0',
  bundles: [
    {
      name: 'core',
      source: './assets/core',
      priority: 1,
      loadTrigger: 'immediate'
    },
    {
      name: 'level1',
      source: './assets/levels/level1',
      priority: 2,
      loadTrigger: 'lazy',
      dependencies: ['core']
    },
    {
      name: 'audio',
      source: './assets/audio',
      priority: 3,
      loadTrigger: 'manual'
    }
  ],
  globalSettings: {
    compression: { algorithm: 'lzma', level: 6 },
    encryption: { enabled: true, algorithm: 'xor' }
  }
}
```

### Runtime QPK Configuration

Runtime packages are dynamic QPKs consumed by `RuntimeContentManager`. They must declare compatibility and package metadata:

```typescript
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './runtime/chapter-2',
  output: './dist/runtime.chapter-2.qpk',
  format: 'qpk',
  compatibility: {
    minGameVersion: '0.1.0',
  },
  runtimePackage: {
    id: 'runtime.chapter-2',
    version: '1.0.0',
    compatibility: {
      minGameVersion: '0.1.0',
    },
    dependencies: ['base'],
    scripts: [
      { id: 'runtime.chapter-2.opening', version: '1.0.0', assetName: 'scripts/opening.js' },
    ],
    storyGraphDeltas: [
      { id: 'chapter-2-graph', graphId: 'main', nodes: [] },
    ],
  },
})
```

QuaScript story declarations, including `@Node`, thumbnails, and `@ChapterSelect`, are written into runtime script metadata and can generate story graph deltas for tooling/runtime activation.

## Asset Types and Organization

Quack automatically detects and categorizes assets:

### Supported Asset Types

- **Images** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`)
  - Subtypes: `backgrounds`, `cg`, `ui`
  - Metadata: width, height, aspect ratio, animated flag, alpha channel

- **Characters** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`)
  - Subtypes: `sprites`
  - Metadata: width, height, aspect ratio, animated flag
- **Audio** (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`)
  - Subtypes: `bgm`, `sfx`, `voice`
  - Metadata: duration, format, bitrate, sample rate, channels

- **Video** (`.mp4`, `.webm`, `.avi`, `.mov`, `.mkv`, `.m4v`, `.wmv`, `.flv`)
  - Subtypes: `cutscenes`, `effects`, `intro`
  - Metadata: width, height, aspect ratio, duration, format, frame rate, codec, audio-track presence

- **Scripts** (`.js`, `.mjs`)
  - Subtypes: `logic`
- **Data** (`.json`, `.xml`, `.yaml`, `.yml`, `.txt`, `.csv`)
  - Subtypes: `config`, `save`

### Directory Structure

```
assets/
├── images/
│   ├── backgrounds/
│   ├── cg/
│   └── ui/
├── characters/
│   ├── alice/
│   └── bob/
├── audio/
│   ├── bgm/
│   ├── sfx/
│   └── voice/
├── video/
│   ├── cutscenes/
│   └── effects/
├── scripts/
└── data/
```

## Localization

Assets can be organized by locale:

```
assets/
├── images/
│   ├── ui/
│   │   ├── button.en.png
│   │   ├── button.zh-cn.png
│   │   └── button.ja.png
│   └── en-us/
│       └── background.png
└── audio/
    ├── voice/
    │   ├── en/
    │   └── ja/
```

## CLI Usage

Install globally for command-line usage:

```bash
pnpm add -g @quajs/quack
```

### Basic Commands

```bash
# Bundle assets
quack bundle ./assets --output ./dist/game.zip

# Create QPK bundle with compression
quack bundle ./assets -o ./dist/game.qpk -f qpk -c lzma

# Sign runtime QPK output
quack bundle ./runtime/chapter-2 -o ./dist/runtime.chapter-2.qpk -f qpk --sign-key ./keys/runtime-private.pem --sign-key-id release-2026-01

# Verify runtime QPK signature
quack verify ./dist/runtime.chapter-2.qpk --public-key ./keys/runtime-public.pem --require-signature --key-id release-2026-01

# Workspace mode
quack workspace build

# Generate patch
quack patch --from v1.0.0 --to v1.1.0

# List bundle contents
quack list ./dist/game.qpk

# Extract bundle
quack extract ./dist/game.qpk ./extracted
```

### Advanced CLI Options

```bash
# Bundle with encryption
quack bundle ./assets -o game.qpk --encrypt --key mySecretKey

# Verbose output
quack bundle ./assets -o game.zip --verbose

# Ignore patterns
quack bundle ./assets -o game.zip --ignore "**/*.tmp" --ignore "**/.*"

# Custom compression level
quack bundle ./assets -o game.qpk -c lzma:9

# Workspace specific bundle
quack workspace build --bundle core
```

## Plugin Development

Create custom plugins to extend Quack's functionality:

```typescript
import { defineConfig } from '@quajs/quack'
import { AssetPipelinePlugin, ImageOptimizationPlugin } from '@quajs/quack/plugins'

export default defineConfig({
  assetTargets: [
    {
      name: 'safari-jxl',
      suffix: 'safari-jxl',
      browserCondition: 'image/jxl',
      pipeline: {
        images: { format: 'jxl', quality: 90 },
        characters: { format: 'jxl', quality: 90 },
      },
    },
    {
      name: 'modern-avif',
      suffix: 'modern-avif',
      browserCondition: 'image/avif',
      pipeline: {
        images: { format: 'avif', quality: 82 },
        characters: { format: 'avif', quality: 82 },
        video: { format: 'webm', codec: 'libvpx-vp9', crf: 32 },
        audio: { format: 'opus', bitrate: '96k' },
        fonts: { format: 'woff2', text: 'QuaEngine' },
      },
    },
    {
      name: 'fallback-webp',
      suffix: 'fallback-webp',
      browserCondition: 'image/webp',
      pipeline: {
        images: { format: 'webp', quality: 84 },
        characters: { format: 'webp', quality: 84 },
        audio: { bitrate: '128k' },
        video: { crf: 34 },
        fonts: { format: 'woff2' },
      },
    },
  ],
  plugins: [
    new AssetPipelinePlugin({
      tools: {
        jxl: { binary: 'cjxl' },
        audio: { binary: 'ffmpeg' },
        video: { binary: 'ffmpeg' },
        fonts: { binary: 'pyftsubset' },
      },
    }),
    new ImageOptimizationPlugin({
      quality: 85,
      progressive: true,
      stripMetadata: true,
      pngquant: {
        enabled: true,
        quality: [65, 90],
        speed: 3,
      },
    }),
  ]
})
```

The built-in image optimizer updates the bundle manifest size/hash after compression. It uses `sharp` for PNG/JPEG/WebP/AVIF when available, falls back to safe PNG IDAT recompression for PNG files, and can call an installed `pngquant` binary for palette quantization.

`AssetPipelinePlugin` is the target-aware pipeline for production packaging. Quack writes one QPK per configured `assetTargets` entry and records target metadata in `index.json` / `workspace-index.json`. Image conversion uses `sharp` for PNG/JPEG/WebP/AVIF and an external `cjxl` command for JPEG XL. When a pipeline is enabled without an explicit format, images/characters default to WebP, audio defaults to AAC, and video defaults to WebM. Audio/video use configurable external commands, defaulting to `ffmpeg`, and font subsetting/conversion defaults to `pyftsubset`.

## API Reference

### Core Classes

#### QuackBundler

Main bundler class for creating asset bundles.

```typescript
const bundler = new QuackBundler(config)
const result = await bundler.bundle()
```

#### AssetDetector

Discovers and analyzes assets in directories.

```typescript
const detector = new AssetDetector(ignoredPatterns)
const assets = await detector.discoverAssets(sourcePath)
const asset = await detector.analyzeAsset(filePath, basePath)
```

#### MediaMetadataExtractor

Extracts metadata from media files. Image metadata uses Quack's lightweight header readers; modern audio/video metadata uses Mediabunny as a Node build-time dependency, with Quack metadata-only readers for AVI, WMV/ASF, and FLV.

```typescript
const extractor = new MediaMetadataExtractor()
const metadata = await extractor.extractMetadata(filePath)
```

MP3, WAV, M4A, FLAC, AAC, OGG, MP4/MOV/M4V, WebM/MKV, AVI, WMV/ASF, and FLV expose structured duration and track metadata when the container provides it. If parsing fails, Quack keeps format-level metadata with zero/undefined fields as an asset QA signal. Mediabunny is included under MPL-2.0.

#### MetadataGenerator

Generates bundle manifests and metadata.

```typescript
const generator = new MetadataGenerator()
const manifest = generator.generateManifest(assets, bundleName, options)
```

#### WorkspaceManager

Manages multi-bundle workspaces.

```typescript
const workspace = new WorkspaceManager(configPath)
await workspace.buildAll()
await workspace.buildBundle('core')
```

#### PatchGenerator

Creates incremental patches between bundle versions.

```typescript
const patchGen = new PatchGenerator()
await patchGen.generatePatch(patchOptions)
```

### Utility Classes

#### EncryptionManager

Handles asset encryption and decryption.

```typescript
const encryption = new EncryptionManager('xor', secretKey)
const encrypted = await encryption.encrypt(buffer)
const decrypted = await encryption.decrypt(encrypted)
```

#### VersionManager

Manages bundle versions and build tracking.

```typescript
const versions = new VersionManager(outputDir)
const buildLog = await versions.createBuildLog(bundlePath, assets)
```

#### PluginManager

Manages and executes plugins.

```typescript
const plugins = new PluginManager()
plugins.register(new MyPlugin())
await plugins.initialize(config)
await plugins.processAsset(context)
```

## Bundle Formats

### ZIP Format

Standard ZIP archives with JSON manifest:

- Widely supported
- Good compression with deflate
- Easy to inspect and extract
- Cross-platform compatibility

### QPK Format (Quack Package)

Custom binary format optimized for games:

- LZMA compression for better ratios
- Built-in encryption support
- Optimized for sequential reading
- Metadata embedding
- Version tracking

## Performance Considerations

### Compression

- **LZMA**: Best compression ratio, slower processing
- **Deflate**: Good balance of speed and compression
- **None**: Fastest processing, no compression

### Memory Usage

- Large assets are processed in streams
- Configurable memory limits for LZMA
- Incremental processing for large bundles

### Caching

- Asset hash-based caching
- Metadata caching for repeated builds
- Incremental builds skip unchanged assets

## Error Handling

Quack includes comprehensive error handling:

```typescript
try {
  const result = await bundler.bundle()
}
catch (error) {
  if (error.code === 'ASSET_NOT_FOUND') {
    console.error('Asset missing:', error.asset)
  }
  else if (error.code === 'COMPRESSION_FAILED') {
    console.error('Compression error:', error.message)
  }
  else if (error.code === 'ENCRYPTION_FAILED') {
    console.error('Encryption error:', error.message)
  }
}
```

## Environment Variables

Configure Quack behavior with environment variables:

```bash
# Encryption key
QUACK_ENCRYPTION_KEY=your-secret-key

# Build number for versioning
BUILD_NUMBER=123

# Enable verbose logging
QUACK_VERBOSE=true

# Memory limit for LZMA compression (MB)
QUACK_LZMA_MEMORY=256
```

## Integration Examples

### Node.js Build Script

```typescript
import { QuackBundler } from '@quajs/quack'

async function buildAssets() {
  const bundler = new QuackBundler({
    source: './src/assets',
    output: './dist/assets.qpk',
    format: 'qpk',
    compression: { algorithm: 'lzma', level: 6 },
    encryption: { enabled: true, algorithm: 'xor' }
  })

  const result = await bundler.bundle()

  console.log(`✅ Bundle created!`)
  console.log(`📁 Files: ${result.manifest.totalFiles}`)
  console.log(`📏 Size: ${(result.manifest.totalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`🗜️ Compressed: ${(result.stats.compressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`📉 Ratio: ${(result.stats.compressionRatio * 100).toFixed(1)}%`)
}

buildAssets().catch(console.error)
```

### GitHub Actions

```yaml
name: Build Assets
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Build assets
        run: quack bundle ./assets -o ./dist/game.qpk -c lzma:9 --encrypt
        env:
          QUACK_ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: game-assets
          path: ./dist/
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/QuaEngine/QuaEngine.git
cd QuaEngine/packages/quack
pnpm install
pnpm run build
pnpm test
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test media-extractor.test.ts
```

## License

Apache-2.0 © QuaDevTeam

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Related Packages

- [`@quajs/engine`](../../core/engine) - QuaEngine core runtime
- [`@quajs/assets`](../../core/assets) - Runtime asset management
- [`@quajs/store`](../../core/store) - State management
- [`@quajs/logger`](../../utils) - Logging utilities
- [`@quajs/utils`](../../utils) - Common utilities
