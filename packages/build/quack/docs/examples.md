# Quack Usage Examples

## Basic Usage

### CLI

```bash
# Set encryption key
export QUACK_ENCRYPTION_KEY="my-super-secret-key-12345"

# Bundle assets (development - creates ZIP)
quack bundle ./assets

# Bundle assets (production - creates QPK with encryption)
NODE_ENV=production quack bundle ./assets -o game.qpk

# Sign runtime package output
quack bundle ./runtime/chapter-2 -o runtime.chapter-2.qpk --sign-key ./keys/runtime-private.pem --sign-key-id release-2026-01

# Extract bundle
quack extract game.qpk ./extracted

# Verify bundle integrity
quack verify game.qpk

# List bundle contents
quack list game.qpk
```

### Programmatic API

```typescript
import { QuackBundler } from '@quajs/quack'
import { AESEncryptionPlugin, AssetPipelinePlugin, ImageOptimizationPlugin } from '@quajs/quack/plugins'

// Basic bundling
const bundler = new QuackBundler({
  source: './my-game-assets',
  output: './dist/game.qpk',
  format: 'qpk',
})

await bundler.bundle()

// Advanced configuration with custom encryption
const advancedBundler = new QuackBundler({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
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
  encryption: {
    enabled: true,
    algorithm: 'custom',
    plugin: new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY!),
  },
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
      quality: 90,
      stripMetadata: true,
      pngquant: {
        enabled: true,
        quality: [70, 95],
        speed: 3,
      },
    }),
  ],
})

const stats = await advancedBundler.bundle()
console.log(`Bundled ${stats.totalFiles} files in ${stats.processingTime}ms`)
```

## Asset Structure Example

```
my-game/
├── assets/
│   ├── images/
│   │   ├── backgrounds/
│   │   │   ├── forest.png
│   │   │   └── castle.png
│   │   ├── cg/
│   │   │   ├── event_01.en-us.png
│   │   │   ├── event_01.ja-jp.png
│   │   │   └── event_02.png
│   │   └── ui/
│   │       ├── button.png
│   │       └── panel.png
│   ├── characters/
│   │   ├── alice/
│   │   │   ├── normal.png
│   │   │   ├── happy.png
│   │   │   └── sad.png
│   │   └── bob/
│   │       ├── normal.png
│   │       └── angry.png
│   ├── audio/
│   │   ├── sfx/
│   │   │   ├── click.wav
│   │   │   └── notification.wav
│   │   ├── voice/
│   │   │   ├── en-us/
│   │   │   │   ├── alice_001.wav
│   │   │   │   └── bob_001.wav
│   │   │   └── ja-jp/
│   │   │       ├── alice_001.wav
│   │   │       └── bob_001.wav
│   │   └── bgm/
│   │       ├── main_theme.mp3
│   │       └── battle_theme.mp3
│   └── scripts/
│       ├── main.js
│       └── utils.js
└── quack.config.js
```

## Configuration Examples

### Basic Configuration

```javascript
// quack.config.js
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './assets',
  output: './dist/game.zip',
  format: 'zip',
})
```

### Production Configuration with Encryption

```javascript
// quack.config.js
import { defineConfig } from '@quajs/quack'
import { AESEncryptionPlugin, BundleAnalyzerPlugin } from '@quajs/quack/plugins'

export default defineConfig({
  source: './assets',
  output: './dist',
  format: 'auto', // zip in dev, qpk in production

  encryption: {
    enabled: process.env.NODE_ENV === 'production',
    algorithm: 'custom',
    plugin: new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY),
  },

  plugins: [new BundleAnalyzerPlugin({ outputPath: './dist/analysis.json' })],

  ignore: ['**/*.tmp', '**/node_modules/**'],
})
```

### Runtime Package Configuration

```javascript
// quack.config.js
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './runtime/chapter-2',
  output: './dist/runtime.chapter-2.qpk',
  format: 'qpk',
  runtimePackage: {
    id: 'runtime.chapter-2',
    version: '1.0.0',
    compatibility: { minGameVersion: '0.1.0' },
    scripts: [
      { id: 'runtime.chapter-2.opening', version: '1.0.0', assetName: 'scripts/opening.js' },
    ],
    storyGraphDeltas: [
      { id: 'runtime.chapter-2.graph', graphId: 'main', nodes: [] },
    ],
  },
})
```

Compiled QuaScript declarations can populate story metadata and graph deltas. `@ChapterSelect` metadata is preserved for project inspection and runtime story graph activation.

## Environment Setup

```bash
# Generate a strong encryption key
export QUACK_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Or set manually
export QUACK_ENCRYPTION_KEY="your-super-secret-encryption-key-here"

# Run bundling
NODE_ENV=production quack bundle
```

## Output Example

```bash
$ NODE_ENV=production quack bundle ./assets
🚀 Bundling assets from: /path/to/assets
📦 Output: /path/to/dist/assets.qpk (qpk)
✅ Bundle created successfully!
📊 127 files, 45.2 MB, 1,234ms
```
