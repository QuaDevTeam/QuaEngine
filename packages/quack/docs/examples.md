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
import { ImageOptimizationPlugin, AESEncryptionPlugin } from '@quajs/quack/plugins'

// Basic bundling
const bundler = new QuackBundler({
  source: './my-game-assets',
  output: './dist/game.qpk',
  format: 'qpk'
})

await bundler.bundle()

// Advanced configuration with custom encryption
const advancedBundler = new QuackBundler({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
  encryption: {
    enabled: true,
    algorithm: 'custom',
    plugin: new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY!)
  },
  plugins: [
    new ImageOptimizationPlugin({ quality: 90 })
  ]
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
  format: 'zip'
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
    plugin: new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY)
  },
  
  plugins: [
    new BundleAnalyzerPlugin({ outputPath: './dist/analysis.json' })
  ],
  
  ignore: ['**/*.tmp', '**/node_modules/**']
})
```

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