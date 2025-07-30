# Quack - QuaEngine Asset Bundler

Quack is a powerful asset bundler designed specifically for QuaEngine, providing efficient packaging of game assets with localization support, integrity checking, and plugin extensibility.

## Features

- 📦 **Smart Asset Organization** - Automatically detects and categorizes game assets
- 🌍 **Multi-language Support** - Built-in localization with automatic locale detection
- 🔒 **Asset Protection** - LZMA compression with XOR encryption for production builds
- 🔌 **Plugin System** - Extensible architecture for custom asset processing
- ⚡ **Fast Hashing** - File integrity verification with fast hash algorithms
- 🛠️ **CLI & API** - Use as command-line tool or programmatic API

## Installation

```bash
pnpm add @quajs/quack
```

## Asset Folder Structure

Quack expects your assets to follow a specific folder structure for optimal organization:

### Basic Structure

```
assets/
├── images/
│   ├── backgrounds/
│   │   ├── bg_001.png
│   │   └── bg_002.png
│   ├── cg/
│   │   ├── event_01.png
│   │   └── event_02.png
│   └── ui/
│       ├── button.png
│       └── panel.png
├── characters/
│   ├── alice/
│   │   ├── normal.png
│   │   ├── happy.png
│   │   └── sad.png
│   └── bob/
│       ├── normal.png
│       └── angry.png
├── audio/
│   ├── sfx/
│   │   ├── click.wav
│   │   └── notification.wav
│   ├── voice/
│   │   ├── alice_001.wav
│   │   └── bob_001.wav
│   └── bgm/
│       ├── main_theme.mp3
│       └── battle_theme.mp3
└── scripts/
    ├── main.js
    └── utils.js
```

### Multi-language Support

Quack supports two approaches for localization:

#### 1. Folder-based Locales

```
assets/
├── images/
│   ├── en-us/
│   │   ├── ui_text.png
│   │   └── logo.png
│   ├── ja-jp/
│   │   ├── ui_text.png
│   │   └── logo.png
│   └── zh-cn/
│       ├── ui_text.png
│       └── logo.png
└── audio/
    ├── voice/
    │   ├── en-us/
    │   │   ├── alice_001.wav
    │   │   └── bob_001.wav
    │   └── ja-jp/
    │       ├── alice_001.wav
    │       └── bob_001.wav
```

#### 2. File-based Locales

```
assets/
├── images/
│   ├── ui_text.en-us.png
│   ├── ui_text.ja-jp.png
│   ├── ui_text.zh-cn.png
│   ├── logo.en-us.png
│   └── logo.ja-jp.png
└── audio/
    ├── voice/
    │   ├── alice_001.en-us.wav
    │   ├── alice_001.ja-jp.wav
    │   ├── bob_001.en-us.wav
    │   └── bob_001.ja-jp.wav
```

**Note**: Files without locale identifiers are treated as "default" locale.

## Asset Types

Quack automatically categorizes assets into the following types:

### Images
- **CG Images**: `images/cg/` - Event graphics and illustrations
- **Backgrounds**: `images/backgrounds/` - Scene backgrounds
- **UI Elements**: `images/ui/` - Interface components
- **Others**: Any other images in the `images/` folder

### Characters
- **Character Sprites**: `characters/[character_name]/` - Character expressions and poses

### Audio
- **Sound Effects**: `audio/sfx/` - Game sound effects
- **Voice Acting**: `audio/voice/` - Character dialogue audio
- **Background Music**: `audio/bgm/` - Music tracks

### Scripts
- **JavaScript Files**: `scripts/` - Game logic and utilities

## CLI Usage

### Basic Bundling

```bash
# Bundle current directory
quack bundle

# Bundle specific directory
quack bundle ./my-game-assets

# Bundle with custom output
quack bundle ./assets --output ./dist/game.zip

# Production build (creates .qpk file)
NODE_ENV=production quack bundle ./assets
```

### CLI Options

```bash
quack bundle [source] [options]

Options:
  -o, --output <path>     Output file path
  -f, --format <format>   Output format (zip|qpk) [default: auto]
  -c, --config <path>     Config file path
  --no-compress          Disable compression
  --no-encrypt           Disable encryption (qpk only)
  --plugin <name>        Load plugin
  -v, --verbose          Verbose output
  -h, --help             Display help
```

## Programmatic API

### Basic Usage

```typescript
import { QuackBundler } from '@quajs/quack'

const bundler = new QuackBundler({
  source: './assets',
  output: './dist/game.zip',
  format: 'zip'
})

await bundler.bundle()
```

### Advanced Configuration

```typescript
import { QuackBundler, QuackPlugin } from '@quajs/quack'

const bundler = new QuackBundler({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
  compression: {
    level: 9,
    algorithm: 'lzma'
  },
  encryption: {
    enabled: true,
    key: 'my-secret-key'
  },
  plugins: [
    new ImageOptimizationPlugin(),
    new AudioCompressionPlugin()
  ]
})

await bundler.bundle()
```

## Bundle Metadata

Each bundle includes a `manifest.json` file with comprehensive metadata:

```json
{
  "version": "1.0.0",
  "bundler": "@quajs/quack@0.1.0",
  "created": "2025-01-15T10:30:00.000Z",
  "format": "qpk",
  "compression": {
    "algorithm": "lzma",
    "level": 6
  },
  "encryption": {
    "enabled": true,
    "algorithm": "xor"
  },
  "locales": ["default", "en-us", "ja-jp"],
  "defaultLocale": "default",
  "assets": {
    "images": {
      "backgrounds": {
        "bg_001.png": {
          "size": 1024000,
          "hash": "sha256:abc123...",
          "locales": ["default"]
        }
      },
      "cg": {
        "event_01.png": {
          "size": 2048000,
          "hash": "sha256:def456...",
          "locales": ["en-us", "ja-jp"]
        }
      }
    },
    "characters": {
      "alice": {
        "normal.png": {
          "size": 512000,
          "hash": "sha256:ghi789...",
          "locales": ["default"]
        }
      }
    },
    "audio": {
      "voice": {
        "alice_001.wav": {
          "size": 204800,
          "hash": "sha256:jkl012...",
          "locales": ["en-us", "ja-jp"]
        }
      }
    },
    "scripts": {
      "main.js": {
        "size": 8192,
        "hash": "sha256:mno345...",
        "locales": ["default"]
      }
    }
  }
}
```

## Plugin Development

Create custom plugins to extend Quack's functionality:

```typescript
import { QuackPlugin, AssetContext } from '@quajs/quack'

export class CustomPlugin extends QuackPlugin {
  name = 'custom-plugin'
  version = '1.0.0'

  async processAsset(context: AssetContext): Promise<void> {
    // Process individual assets before bundling
    if (context.asset.type === 'image') {
      // Optimize images
      context.buffer = await this.optimizeImage(context.buffer)
    }
  }

  async postBundle(bundlePath: string): Promise<void> {
    // Process the final bundle
    console.log(`Bundle created at: ${bundlePath}`)
  }
}
```

## Configuration File

Create a `quack.config.js` file for complex configurations:

```javascript
import { defineConfig } from '@quajs/quack'
import { ImageOptimizationPlugin } from '@quajs/quack/plugins'

export default defineConfig({
  source: './assets',
  output: './dist',
  format: 'auto', // 'zip' in development, 'qpk' in production
  compression: {
    level: 6,
    algorithm: 'lzma'
  },
  encryption: {
    enabled: process.env.NODE_ENV === 'production',
    algorithm: 'xor',
    keyGenerator: () => 'my-secret-key'
  },
  plugins: [
    new ImageOptimizationPlugin({
      quality: 85,
      progressive: true
    })
  ],
  ignore: [
    '**/*.tmp',
    '**/.*',
    'node_modules/**'
  ]
})
```

## Output Formats

### ZIP Format
- Standard ZIP compression
- Cross-platform compatibility
- Easy to inspect and debug
- Used by default in development

### QPK Format (QuaEngine Package)
- Custom binary format optimized for games
- LZMA compression for smaller file sizes
- XOR encryption for basic asset protection
- Optimized for runtime loading
- Used by default in production

## Security & Encryption

Quack provides multiple encryption options for protecting your game assets:

### Environment-Based Encryption

For security, Quack requires encryption keys to be provided via environment variables or configuration:

```bash
# Set encryption key via environment variable
export QUACK_ENCRYPTION_KEY="your-secret-key-here"

# Now encryption will be enabled automatically in production
NODE_ENV=production quack bundle ./assets
```

**Important**: If no encryption key is provided and no custom encryption plugin is registered, encryption will be **skipped** even if requested. This prevents using weak default keys.

### XOR Encryption (Built-in)

Basic XOR encryption using a secure key:

```typescript
import { QuackBundler } from '@quajs/quack'

const bundler = new QuackBundler({
  source: './assets',
  format: 'qpk',
  encryption: {
    enabled: true,
    algorithm: 'xor',
    key: process.env.QUACK_ENCRYPTION_KEY // Or provide directly (not recommended)
  }
})
```

### Custom Encryption Plugins

For stronger security, implement custom encryption:

```typescript
import { QuackBundler, EncryptionPlugin } from '@quajs/quack'
import { AESEncryptionPlugin } from '@quajs/quack/plugins'

// Use built-in AES encryption
const aesPlugin = new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY)

const bundler = new QuackBundler({
  source: './assets',
  format: 'qpk',
  encryption: {
    enabled: true,
    algorithm: 'custom',
    plugin: aesPlugin
  }
})
```

### Creating Custom Encryption Plugins

```typescript
import { EncryptionPlugin, EncryptionContext } from '@quajs/quack'

class MyEncryptionPlugin implements EncryptionPlugin {
  name = 'my-encryption'
  algorithm = 'custom-algo'

  encrypt(context: EncryptionContext): Buffer {
    // Implement your encryption logic
    return encryptedBuffer
  }

  decrypt(context: EncryptionContext): Buffer {
    // Implement your decryption logic
    return decryptedBuffer
  }
}
```

### Multi-Layer Encryption

Combine multiple encryption methods:

```typescript
import { MultiLayerEncryptionPlugin, AESEncryptionPlugin, SimpleRotationPlugin } from '@quajs/quack/plugins'

const multiLayer = new MultiLayerEncryptionPlugin([
  new SimpleRotationPlugin(42),
  new AESEncryptionPlugin(process.env.QUACK_ENCRYPTION_KEY)
])

const bundler = new QuackBundler({
  source: './assets',
  encryption: {
    enabled: true,
    algorithm: 'custom',
    plugin: multiLayer
  }
})
```

### Security Best Practices

1. **Never hardcode encryption keys** in your source code
2. **Use environment variables** for production keys
3. **Use strong keys** (at least 32 characters for good security)
4. **Consider AES encryption** for sensitive assets instead of XOR
5. **Rotate keys regularly** and have a key management strategy
6. **Test decryption** in your game to ensure compatibility

### Environment Variables

- `QUACK_ENCRYPTION_KEY`: Main encryption key (required for XOR encryption)

```bash
# Example: Generate a strong random key
export QUACK_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

## Bundle Versioning & Patching

Quack provides comprehensive versioning and incremental update support for game assets:

### Version Management

Each bundle has:
- **Bundle Version**: Overall version number (incremental)
- **Build Number**: Unique build identifier with timestamp
- **Asset Versions**: Individual version numbers for each asset
- **Merkle Tree**: Cryptographic integrity verification

### Automatic Versioning

```typescript
import { QuackBundler } from '@quajs/quack'

const bundler = new QuackBundler({
  source: './assets',
  versioning: {
    incrementVersion: true, // Auto-increment from previous version
    // bundleVersion: 5,    // Or specify explicit version
    // buildNumber: 'custom-build' // Or specify custom build ID
  }
})

await bundler.bundle()
```

### Version Files & Build Logs

Quack automatically maintains:
- `.quack-version.json` - Current version state
- `.quack-logs/` - Detailed build logs with asset information
- `index.json` - Bundle index with version history

Example `index.json`:
```json
{
  "currentVersion": 3,
  "currentBuild": "2025-01-15T10-30-00-abc123",
  "latestBundle": {
    "filename": "game.a1b2c3d4.qpk",
    "hash": "sha256:abc123...",
    "version": 3,
    "buildNumber": "2025-01-15T10-30-00-abc123",
    "created": "2025-01-15T10:30:00.000Z",
    "size": 52428800
  },
  "previousBuilds": [...],
  "availablePatches": [...]
}
```

### Hashed Bundle Names

Bundles are automatically named with content hashes (webpack-style):
```
game.a1b2c3d4.qpk  // Production QPK bundle
assets.f5e6d7c8.zip // Development ZIP bundle
```

### Patch Generation

Create incremental update patches between versions:

```bash
# Create patch from version 2 to version 3
quack patch --from 2 --to 3 -o patch-2-to-3.qpk

# Create patch using specific build numbers
quack patch --from-build "2025-01-14T08-00-00-def456" --to-build "2025-01-15T10-30-00-abc123"
```

### Programmatic Patch Creation

```typescript
import { PatchGenerator, VersionManager } from '@quajs/quack'

const patchGenerator = new PatchGenerator()
const versionManager = new VersionManager()

// Get build logs
const fromBuildLog = await versionManager.getBuildLogByVersion(2)
const toBuildLog = await versionManager.getBuildLogByVersion(3)

// Generate patch
await patchGenerator.generatePatch({
  fromVersion: 2,
  toVersion: 3,
  fromBuildLog,
  toBuildLog,
  output: './patches/patch-2-to-3.qpk',
  format: 'qpk'
})
```

### Patch Structure

Patches contain:
- **Added files**: New assets in the target version
- **Modified files**: Changed assets with new content
- **Deleted files**: Assets removed in target version
- **Metadata**: Detailed change information

Example patch manifest:
```json
{
  "isPatch": true,
  "patchVersion": 2003,
  "fromVersion": 2,
  "toVersion": 3,
  "changes": {
    "added": [
      {
        "path": "images/new-character.png",
        "operation": "added",
        "newHash": "sha256:abc123...",
        "size": 204800
      }
    ],
    "modified": [
      {
        "path": "scripts/main.js",
        "operation": "modified",
        "oldHash": "sha256:def456...",
        "newHash": "sha256:ghi789...",
        "size": 8192
      }
    ],
    "deleted": [
      {
        "path": "images/old-background.png",
        "operation": "deleted", 
        "oldHash": "sha256:jkl012..."
      }
    ]
  },
  "totalChanges": 3
}
```

### CLI Commands

#### Version Information
```bash
# Show current version info
quack version-info

# Show detailed version history
quack version-info -v

# List all builds
quack builds

# List available patches
quack patches

# List patches from specific version
quack patches --from 2
```

#### Patch Operations
```bash
# Create patch between versions
quack patch --from 2 --to 3

# Validate patch file
quack validate-patch patch-2-to-3.qpk --target-version 2

# Validate with detailed output
quack validate-patch patch-2-to-3.qpk -v
```

### Merkle Tree Verification

Each bundle includes a Merkle tree root hash for integrity verification:

```typescript
import { VersionManager } from '@quajs/quack'

const versionManager = new VersionManager()

// Verify bundle integrity using Merkle tree
const buildLog = await versionManager.getBuildLogByVersion(3)
console.log(`Merkle Root: ${buildLog.merkleRoot}`)

// The Merkle tree allows verification of individual files
// without downloading the entire bundle
```

### Integration with Game Clients

Client-side integration example:

```typescript
// Check for updates
const currentVersion = getLocalGameVersion()
const indexResponse = await fetch('/game-assets/index.json')
const index = await indexResponse.json()

if (index.currentVersion > currentVersion) {
  // Find available patch
  const patch = index.availablePatches.find(p => 
    p.fromVersion === currentVersion && 
    p.toVersion === index.currentVersion
  )
  
  if (patch) {
    // Download and apply patch
    console.log(`Applying patch: ${patch.filename}`)
    await downloadAndApplyPatch(patch.filename)
  } else {
    // Download full bundle
    console.log(`Downloading full update: ${index.latestBundle.filename}`)
    await downloadFullBundle(index.latestBundle.filename)
  }
}
```

### Advanced Features

#### Custom Version Schemes
```typescript
const bundler = new QuackBundler({
  versioning: {
    buildNumber: `${process.env.CI_PIPELINE_ID}-${process.env.GIT_COMMIT_SHA.slice(0, 8)}`,
    bundleVersion: parseInt(process.env.BUILD_NUMBER) || 1
  }
})
```

#### Patch Validation
```typescript
import { PatchGenerator } from '@quajs/quack'

const patchGenerator = new PatchGenerator()
const validation = await patchGenerator.validatePatch('./patch.qpk', 2)

if (!validation.valid) {
  console.error('Patch validation failed:', validation.errors)
  return
}

console.log('Patch will make the following changes:')
console.log(`- Add ${validation.changes.willAdd.length} files`)
console.log(`- Modify ${validation.changes.willModify.length} files`) 
console.log(`- Delete ${validation.changes.willDelete.length} files`)
```

This versioning system enables efficient incremental updates for your game, reducing download sizes and improving user experience!

## Multi-Bundle Workspaces

For progressive asset loading and better performance, Quack supports multi-bundle workspaces where you can split assets into multiple bundles that load independently or based on dependencies.

### Workspace Configuration

Create a workspace configuration file (`quack.workspace.js`) to define multiple bundles:

```javascript
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  workspace: {
    name: 'MyGameAssets',
    version: '1.0.0',
    bundles: [
      {
        name: 'core',
        displayName: 'Core Assets',
        source: './assets/core',
        priority: 0,
        loadTrigger: 'immediate',
        description: 'Essential game assets that must be loaded first',
        dependencies: [],
        format: 'qpk'
      },
      {
        name: 'ui',
        displayName: 'User Interface',
        source: './assets/ui',
        priority: 1,
        loadTrigger: 'immediate',
        description: 'User interface elements and menus',
        dependencies: ['core'],
        format: 'zip'
      },
      {
        name: 'levels',
        displayName: 'Game Levels',
        source: './assets/levels',
        priority: 2,
        loadTrigger: 'lazy',
        description: 'Level-specific assets loaded on demand',
        dependencies: ['core', 'ui'],
        format: 'qpk'
      },
      {
        name: 'audio',
        displayName: 'Audio Assets',
        source: './assets/audio',
        priority: 3,
        loadTrigger: 'lazy',
        description: 'Music and sound effects',
        dependencies: ['core'],
        format: 'qpk',
        compression: {
          level: 9,
          algorithm: 'lzma'
        }
      }
    ],
    globalSettings: {
      compression: {
        level: 6,
        algorithm: 'lzma'
      },
      encryption: {
        enabled: true,
        algorithm: 'xor'
      },
      versioning: {
        incrementVersion: true
      }
    },
    output: './dist'
  }
})
```

### Bundle Definition Properties

Each bundle can specify:

- **`name`**: Unique bundle identifier
- **`displayName`**: Human-readable name
- **`source`**: Source directory (relative to workspace root)
- **`priority`**: Loading priority (lower numbers load first)
- **`dependencies`**: Array of bundle names this bundle depends on
- **`loadTrigger`**: When to load (`'immediate'`, `'lazy'`, `'manual'`)
- **`format`**: Bundle format (`'zip'` or `'qpk'`)
- **`compression`**: Bundle-specific compression settings
- **`encryption`**: Bundle-specific encryption settings

### Workspace CLI Commands

#### Initialize Workspace
```bash
# Create a new workspace configuration
quack workspace:init --name "MyGame"

# Force overwrite existing configuration
quack workspace:init --force
```

#### Build Bundles
```bash
# Build all bundles in workspace
quack workspace:bundle --all

# Build specific bundle
quack workspace:bundle --bundle core

# Build with verbose output
quack workspace:bundle --all --verbose
```

#### Workspace Status
```bash
# Show workspace overview
quack workspace:status

# Show detailed bundle information
quack workspace:status --verbose
```

#### Create Bundle Patches
```bash
# Create patch for specific bundle
quack workspace:patch --bundle core --from 1 --to 2

# Create patch with custom output
quack workspace:patch --bundle levels --from 2 --to 3 --output ./patches/levels-update.qpk

# Create patch using build numbers
quack workspace:patch --bundle ui --from-build "2025-01-14T08-00-00-abc123" --to-build "2025-01-15T10-30-00-def456"
```

#### List Patches
```bash
# List all workspace patches
quack workspace:patches

# List patches for specific bundle
quack workspace:patches --bundle core

# Verbose patch information
quack workspace:patches --verbose
```

### Workspace Index Structure

Quack maintains a `workspace-index.json` file that tracks all bundles and their versions:

```json
{
  "workspace": {
    "name": "MyGameAssets",
    "version": "1.0.0",
    "created": "2025-01-15T10:00:00.000Z",
    "updated": "2025-01-15T12:30:00.000Z"
  },
  "currentVersion": 3,
  "currentBuild": "2025-01-15T12-30-00-xyz789",
  "bundles": {
    "core": {
      "name": "core",
      "displayName": "Core Assets",
      "currentVersion": 3,
      "currentBuild": "2025-01-15T12-30-00-xyz789",
      "priority": 0,
      "dependencies": [],
      "loadTrigger": "immediate",
      "latestBundle": {
        "filename": "core.a1b2c3d4.qpk",
        "hash": "sha256:abc123...",
        "version": 3,
        "buildNumber": "2025-01-15T12-30-00-xyz789",
        "created": "2025-01-15T12:30:00.000Z",
        "size": 10485760
      },
      "previousBuilds": [...],
      "availablePatches": [...]
    },
    "ui": {
      "name": "ui",
      "displayName": "User Interface",
      "currentVersion": 2,
      "currentBuild": "2025-01-15T11-15-00-def456",
      "priority": 1,
      "dependencies": ["core"],
      "loadTrigger": "immediate",
      "latestBundle": {
        "filename": "ui.e5f6g7h8.zip",
        "hash": "sha256:def456...",
        "version": 2,
        "buildNumber": "2025-01-15T11-15-00-def456",
        "created": "2025-01-15T11:15:00.000Z",
        "size": 2097152
      },
      "previousBuilds": [...],
      "availablePatches": [...]
    }
  },
  "globalPatches": [
    {
      "filename": "multi-bundle-patch-1-to-2.qpk",
      "hash": "sha256:global123...",
      "fromVersion": 1,
      "toVersion": 2,
      "patchVersion": 1002,
      "created": "2025-01-15T11:00:00.000Z",
      "size": 524288,
      "changeCount": 15,
      "affectedBundles": ["core", "ui"]
    }
  ]
}
```

### Progressive Loading Strategy

#### Loading Priority
Bundles are loaded based on their `priority` value and `loadTrigger`:

1. **Priority 0 (Immediate)**: Core assets - loaded immediately
2. **Priority 1 (Immediate)**: UI assets - loaded immediately after core
3. **Priority 2+ (Lazy)**: Optional assets - loaded on demand

#### Client Integration Example

```typescript
// Game client progressive loading
class AssetLoader {
  async loadGameAssets() {
    // Load workspace index
    const index = await fetch('/assets/workspace-index.json').then(r => r.json())
    
    // Load immediate bundles first (priority-sorted)
    const immediateBundles = Object.values(index.bundles)
      .filter(bundle => bundle.loadTrigger === 'immediate')
      .sort((a, b) => a.priority - b.priority)
    
    for (const bundle of immediateBundles) {
      await this.loadBundle(bundle.name, bundle.latestBundle.filename)
      this.markBundleReady(bundle.name)
    }
    
    // Game can start now with core + UI assets
    this.startGame()
    
    // Load lazy bundles in background
    this.loadLazyBundles(index)
  }
  
  async loadBundle(name: string, filename: string) {
    const response = await fetch(`/assets/${filename}`)
    const bundle = await response.arrayBuffer()
    await this.extractAndCacheBundle(name, bundle)
  }
  
  async loadLazyBundles(index: WorkspaceIndex) {
    const lazyBundles = Object.values(index.bundles)
      .filter(bundle => bundle.loadTrigger === 'lazy')
      .sort((a, b) => a.priority - b.priority)
    
    for (const bundle of lazyBundles) {
      // Check if dependencies are loaded
      if (this.areDependenciesReady(bundle.dependencies)) {
        await this.loadBundle(bundle.name, bundle.latestBundle.filename)
        this.markBundleReady(bundle.name)
      }
    }
  }
}
```

### Patch Management in Workspaces

#### Bundle-Specific Patches
Each bundle can have its own patches independent of other bundles:

```bash
# Update only the audio bundle
quack workspace:patch --bundle audio --from 1 --to 2
```

#### Multi-Bundle Updates
When multiple bundles need updates, you can:

1. **Create individual patches** for each bundle
2. **Coordinate loading** based on dependencies
3. **Use global patches** for cross-bundle updates

#### Validation
```bash
# Validate a workspace bundle patch
quack validate-patch core-patch-1-to-2.qpk --target-version 1
```

### Advanced Workspace Features

#### Bundle Dependencies
Quack automatically resolves and validates dependencies:

```javascript
{
  name: 'gameplay',
  dependencies: ['core', 'ui', 'audio'], // Will load after these bundles
  loadTrigger: 'manual' // Won't load automatically
}
```

#### Custom Loading Triggers
- **`immediate`**: Load during initial game startup
- **`lazy`**: Load in background after immediate bundles
- **`manual`**: Load only when explicitly requested

#### Bundle-Specific Settings
Override global settings per bundle:

```javascript
{
  name: 'audio',
  compression: {
    level: 9, // Higher compression for audio
    algorithm: 'lzma'
  },
  encryption: {
    enabled: false // Audio doesn't need encryption
  }
}
```

### Performance Benefits

Multi-bundle workspaces provide:

- **Faster Initial Load**: Only essential assets loaded first
- **Progressive Enhancement**: Additional content loads in background
- **Reduced Memory Usage**: Load only needed assets
- **Efficient Updates**: Update individual bundles independently
- **Flexible Deployment**: Deploy bundles to different CDNs
- **Better Caching**: Granular cache invalidation per bundle

### Best Practices

1. **Keep Core Small**: Include only essential assets in immediate bundles
2. **Logical Grouping**: Group related assets together (UI, audio, levels)
3. **Consider Dependencies**: Minimize cross-bundle dependencies
4. **Test Loading Order**: Verify bundles load in correct sequence
5. **Monitor Bundle Sizes**: Keep individual bundles reasonably sized
6. **Use Appropriate Triggers**: Choose loading triggers based on usage patterns

This multi-bundle system enables sophisticated progressive loading strategies for modern web games!

## Performance

- **Parallel processing** for large asset collections
- **Streaming compression** for memory efficiency  
- **Fast hashing algorithms** for integrity checking
- **Merkle tree verification** for efficient partial validation
- **Incremental patches** to minimize update sizes
- **Content-based file naming** for optimal caching
- **Multi-bundle progressive loading** for faster initial game startup
- **Optimized for both development and production** workflows

## License

Apache-2.0 - see LICENSE file for details