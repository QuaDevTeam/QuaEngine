# API Reference

Complete API documentation for @quajs/quack package.

## Table of Contents

- [Core Classes](#core-classes)
- [Utility Classes](#utility-classes)
- [Types and Interfaces](#types-and-interfaces)
- [Functions](#functions)
- [CLI Commands](#cli-commands)

## Core Classes

### QuackBundler

Main bundler class for creating asset bundles.

```typescript
class QuackBundler {
  constructor(config: QuackConfig)

  async bundle(): Promise<BundleResult>
  async createBundle(assets: AssetInfo[], options: BundleOptions): Promise<BundleResult>
  getConfig(): QuackConfig
  setConfig(config: Partial<QuackConfig>): void
}
```

#### Example Usage

```typescript
import { defineConfig, QuackBundler } from '@quajs/quack'

const config = defineConfig({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
  compression: { algorithm: 'lzma', level: 6 },
})

const bundler = new QuackBundler(config)
const result = await bundler.bundle()
```

### AssetDetector

Discovers and analyzes assets in directories.

```typescript
class AssetDetector {
  constructor(ignoredPatterns?: string[])

  async discoverAssets(sourcePath: string): Promise<AssetInfo[]>
  async analyzeAsset(filePath: string, basePath: string): Promise<AssetInfo | null>
  groupAssets(assets: AssetInfo[]): Record<AssetType, Record<string, AssetInfo[]>>
  getLocalesFromAssets(assets: AssetInfo[]): LocaleInfo[]
  calculateHash(buffer: Buffer): string
  async validateAsset(filePath: string): Promise<boolean>
}
```

#### Methods

##### `discoverAssets(sourcePath: string): Promise<AssetInfo[]>`

Recursively discovers all assets in a directory.

**Parameters:**

- `sourcePath` - Directory to scan for assets

**Returns:** Array of discovered asset information

**Example:**

```typescript
const detector = new AssetDetector(['**/*.tmp', '**/.*'])
const assets = await detector.discoverAssets('./game-assets')
console.log(`Found ${assets.length} assets`)
```

##### `analyzeAsset(filePath: string, basePath: string): Promise<AssetInfo | null>`

Analyzes a single asset file and extracts metadata.

**Parameters:**

- `filePath` - Absolute path to the asset file
- `basePath` - Base directory for relative path calculation

**Returns:** Asset information with metadata, or null if not supported

**Example:**

```typescript
const asset = await detector.analyzeAsset('/path/to/image.png', '/path/to/assets')
if (asset?.mediaMetadata) {
  console.log(`Image: ${asset.mediaMetadata.width}x${asset.mediaMetadata.height}`)
}
```

### MediaMetadataExtractor

Extracts metadata from media files.

```typescript
class MediaMetadataExtractor {
  async extractMetadata(filePath: string): Promise<MediaMetadata | null>
}
```

#### Methods

##### `extractMetadata(filePath: string): Promise<MediaMetadata | null>`

Extracts media-specific metadata from supported file types.

**Supported formats:**

- **Images**: PNG, JPEG, GIF, WebP, BMP, SVG
- **Audio**: MP3, WAV, OGG, M4A, FLAC, AAC
- **Video**: MP4, WebM, AVI, MOV, MKV, WMV, FLV

**Returns:** Format-specific metadata or null if unsupported

**Example:**

```typescript
const extractor = new MediaMetadataExtractor()

// Image metadata
const imageData = await extractor.extractMetadata('screenshot.png')
if (imageData) {
  console.log(`PNG: ${imageData.width}x${imageData.height}, animated: ${imageData.animated}`)
}

// Audio metadata
const audioData = await extractor.extractMetadata('music.mp3')
if (audioData) {
  console.log(`MP3: ${audioData.duration}s, ${audioData.sampleRate}Hz`)
}
```

### MetadataGenerator

Generates bundle manifests and metadata.

```typescript
class MetadataGenerator {
  generateManifest(assets: AssetInfo[], bundleName: string, options: ManifestOptions): BundleManifest

  validateManifest(manifest: BundleManifest): boolean
  calculateStats(manifest: BundleManifest, compressedSize: number, processingTime: number): BundleStats
  generateAssetStats(assets: AssetInfo[]): AssetStats
  generateIntegrityReport(assets: AssetInfo[]): Record<string, string>
  async verifyIntegrity(assets: AssetInfo[], manifest: BundleManifest): Promise<{ valid: boolean, errors: string[] }>
}
```

#### Methods

##### `generateManifest(assets, bundleName, options): BundleManifest`

Creates a complete bundle manifest from asset list.

**Parameters:**

- `assets` - Array of asset information
- `bundleName` - Name for the bundle
- `options` - Manifest generation options

**Example:**

```typescript
const generator = new MetadataGenerator()
const manifest = generator.generateManifest(assets, 'my-game', {
  format: 'qpk',
  compression: { algorithm: 'lzma', level: 6 },
  encryption: { enabled: true, algorithm: 'xor' },
  version: '1.0.0',
})
```

### WorkspaceManager

Manages multi-bundle workspaces.

```typescript
class WorkspaceManager {
  constructor(configPath?: string)

  async loadWorkspace(): Promise<WorkspaceConfig>
  async buildAll(): Promise<void>
  async buildBundle(bundleName: string): Promise<void>
  async listBundles(): Promise<BundleDefinition[]>
  async getBundle(name: string): Promise<BundleDefinition | null>
  async addBundle(bundle: BundleDefinition): Promise<void>
  async removeBundle(name: string): Promise<boolean>
}
```

#### Example Usage

```typescript
import { WorkspaceManager } from '@quajs/quack'

const workspace = new WorkspaceManager('./quack.workspace.js')
await workspace.loadWorkspace()

// Build all bundles
await workspace.buildAll()

// Build specific bundle
await workspace.buildBundle('core')
```

### PatchGenerator

Creates incremental patches between bundle versions.

```typescript
class PatchGenerator {
  constructor(outputDir?: string, workspaceMode?: boolean)

  async generatePatch(options: PatchOptions): Promise<void>
  async validatePatch(patchPath: string, targetVersion: number): Promise<PatchValidationResult>
  async listAvailablePatches(fromVersion?: number): Promise<PatchInfo[]>
  async getPatchChain(fromVersion: number, toVersion: number): Promise<PatchInfo[] | null>
}
```

#### Methods

##### `generatePatch(options: PatchOptions): Promise<void>`

Generates a patch bundle between two versions.

**Example:**

```typescript
const patchGen = new PatchGenerator('./patches')
await patchGen.generatePatch({
  fromVersion: 1,
  toVersion: 2,
  fromBuildLog: oldBuildLog,
  toBuildLog: newBuildLog,
  output: './patches/v1-to-v2.qpk',
  format: 'qpk',
})
```

## Utility Classes

### EncryptionManager

Handles asset encryption and decryption.

```typescript
class EncryptionManager {
  constructor(algorithm?: EncryptionAlgorithm, key?: string, plugin?: EncryptionPlugin)

  isEncryptionAvailable(): boolean
  async encrypt(buffer: Buffer, metadata?: Record<string, any>): Promise<Buffer>
  async decrypt(buffer: Buffer, metadata?: Record<string, any>): Promise<Buffer>
  getEncryptionInfo(): { enabled: boolean, algorithm: EncryptionAlgorithm }
  validateConfiguration(): { valid: boolean, errors: string[] }
  static getEncryptionKeyEnvVar(): string
  static hasEnvironmentKey(): boolean
}
```

### VersionManager

Manages bundle versions and build tracking.

```typescript
class VersionManager {
  constructor(outputDir?: string, workspaceMode?: boolean)

  async createBuildLog(bundlePath: string, assets: AssetInfo[]): Promise<BuildLog>
  async getBuildLog(version: number): Promise<BuildLog | null>
  async getCurrentVersion(): Promise<number>
  async incrementVersion(): Promise<number>
  async getBundleIndex(): Promise<BundleIndex | null>
  async updateBundleIndex(bundleInfo: any): Promise<void>
}
```

### PluginManager

Manages and executes plugins.

```typescript
class PluginManager {
  register(plugin: QuackPlugin): void
  registerMany(plugins: QuackPlugin[]): void
  getPlugins(): QuackPlugin[]
  getPlugin(name: string): QuackPlugin | undefined
  async initialize(config: QuackConfig): Promise<void>
  async processAsset(context: AssetContext): Promise<void>
  async postBundle(bundlePath: string, manifest: BundleManifest): Promise<void>
  async cleanup(): Promise<void>
}
```

### ZipBundler

Creates and reads ZIP format bundles.

```typescript
class ZipBundler {
  constructor(plugins?: QuackPlugin[])

  async createBundle(assets: AssetInfo[], manifest: BundleManifest, outputPath: string): Promise<void>

  async readBundle(bundlePath: string): Promise<{
    manifest: BundleManifest
    assets: Map<string, Buffer>
  }>

  async extractBundle(bundlePath: string, outputDir: string): Promise<BundleManifest>
  async listAssets(bundlePath: string): Promise<string[]>
}
```

### QPKBundler

Creates and reads QPK format bundles.

```typescript
class QPKBundler {
  constructor(plugins?: QuackPlugin[], encryptionAlgorithm?: EncryptionAlgorithm, encryptionKey?: string)

  async createBundle(assets: AssetInfo[], manifest: BundleManifest, outputPath: string, options?: QPKOptions): Promise<void>

  async readBundle(bundlePath: string): Promise<{
    manifest: BundleManifest
    assets: Map<string, Buffer>
  }>

  async extractAsset(bundlePath: string, assetPath: string): Promise<Buffer | null>
  async listAssets(bundlePath: string): Promise<string[]>
}
```

## Types and Interfaces

### Core Types

```typescript
// Asset types
type AssetType = 'images' | 'characters' | 'audio' | 'video' | 'scripts' | 'data'

type AssetSubType
  = | 'backgrounds'
    | 'cg'
    | 'ui' // Images
    | 'sprites' // Characters
    | 'sfx'
    | 'voice'
    | 'bgm' // Audio
    | 'cutscenes'
    | 'effects'
    | 'intro' // Video
    | 'logic' // Scripts
    | 'config'
    | 'save' // Data

// Bundle formats
type BundleFormat = 'zip' | 'qpk'

// Compression algorithms
type CompressionAlgorithm = 'none' | 'deflate' | 'lzma'

// Encryption algorithms
type EncryptionAlgorithm = 'none' | 'xor' | 'custom'
```

### Asset Information

```typescript
interface AssetInfo {
  name: string // File name
  path: string // Absolute file path
  relativePath: string // Relative path from source
  size: number // File size in bytes
  hash: string // SHA-256 hash
  type: AssetType // Asset category
  subType?: AssetSubType // Asset subcategory
  locales: string[] // Supported locales
  mimeType?: string // MIME type
  mtime?: number // Modification time
  version?: number // Asset version
  mediaMetadata?: MediaMetadata // Media-specific metadata
}
```

### Media Metadata

```typescript
interface ImageMetadata {
  width: number
  height: number
  aspectRatio: number
  animated: boolean
  format: string
  colorDepth?: number
  hasAlpha?: boolean
}

interface AudioMetadata {
  duration: number
  format: string
  bitrate?: number
  sampleRate?: number
  channels?: number
}

interface VideoMetadata {
  width: number
  height: number
  aspectRatio: number
  duration: number
  format: string
  frameRate?: number
  bitrate?: number
  hasAudio?: boolean
  codec?: string
}

type MediaMetadata = ImageMetadata | AudioMetadata | VideoMetadata
```

### Configuration

```typescript
interface QuackConfig {
  // Single bundle mode
  source?: string
  output?: string
  format?: BundleFormat | 'auto'

  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }

  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string | (() => string)
    plugin?: EncryptionPlugin
  }

  versioning?: VersionConfig
  plugins?: QuackPlugin[]
  ignore?: string[]
  verbose?: boolean

  // Workspace mode
  workspace?: WorkspaceConfig
  workspaceConfig?: string
  bundle?: string
  bundles?: string[]
}
```

### Bundle Manifest

```typescript
interface BundleManifest {
  name: string
  version: string
  bundler: string
  created: string
  createdAt: number
  format: BundleFormat
  bundleVersion: number
  buildNumber?: string

  compression: {
    algorithm: CompressionAlgorithm
    level?: number
  }

  encryption: {
    enabled: boolean
    algorithm: EncryptionAlgorithm
  }

  locales: string[]
  defaultLocale: string
  assets: Record<AssetType, Record<string, AssetInfo>>
  totalSize: number
  totalFiles: number

  performanceMetrics?: {
    estimatedLoadTime: number
    estimatedDecompressionTime: number
    memoryUsageEstimate: number
  }
}
```

### Workspace Configuration

```typescript
interface WorkspaceConfig {
  name: string
  version?: string
  bundles: BundleDefinition[]

  globalSettings?: {
    compression?: {
      level?: number
      algorithm?: CompressionAlgorithm
    }
    encryption?: {
      enabled?: boolean
      algorithm?: EncryptionAlgorithm
      key?: string
    }
    versioning?: VersionConfig
  }

  output?: string
}

interface BundleDefinition {
  name: string
  displayName?: string
  source: string
  priority?: number
  dependencies?: string[]
  loadTrigger?: 'immediate' | 'lazy' | 'manual'
  description?: string

  // Bundle-specific overrides
  format?: BundleFormat
  compression?: {
    level?: number
    algorithm?: CompressionAlgorithm
  }
  encryption?: {
    enabled?: boolean
    algorithm?: EncryptionAlgorithm
    key?: string
  }
}
```

## Functions

### defineConfig

Helper function for creating typed configuration objects.

```typescript
function defineConfig(config: QuackConfig): QuackConfig
```

**Example:**

```typescript
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
  compression: {
    algorithm: 'lzma',
    level: 6,
  },
})
```

## Plugin System

### Base Plugin Class

```typescript
abstract class QuackPlugin {
  abstract name: string
  abstract version: string

  async initialize?(config: QuackConfig): Promise<void>
  async processAsset?(context: AssetContext): Promise<void>
  async postBundle?(bundlePath: string, manifest: BundleManifest): Promise<void>
  async cleanup?(): Promise<void>
}
```

### Plugin Context

```typescript
interface AssetContext {
  asset: AssetInfo
  buffer: Buffer
  metadata: Record<string, any>
}
```

### Example Plugin

```typescript
export class ImageOptimizationPlugin extends QuackPlugin {
  name = 'image-optimization'
  version = '1.0.0'

  async processAsset(context: AssetContext) {
    if (context.asset.type === 'images') {
      // Optimize image buffer
      context.buffer = await this.optimizeImage(context.buffer)
    }
  }

  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    // Implementation here
    return buffer
  }
}
```

## CLI Commands

### Bundle Creation

```bash
# Basic bundle
quack bundle <source> [options]

# Options:
-o, --output <path>      Output bundle path
-f, --format <format>    Bundle format (zip|qpk|auto)
-c, --compression <alg>  Compression (none|deflate|lzma[:level])
-e, --encrypt           Enable encryption
-k, --key <key>         Encryption key
-i, --ignore <pattern>   Ignore patterns
-v, --verbose           Verbose output
```

### Workspace Commands

```bash
# Build workspace
quack workspace build [bundle]

# List bundles
quack workspace list

# Add bundle
quack workspace add <name> <source>

# Remove bundle
quack workspace remove <name>
```

### Bundle Inspection

```bash
# List contents
quack list <bundle>

# Show info
quack info <bundle>

# Verify integrity
quack verify <bundle>

# Extract bundle
quack extract <bundle> <output>
```

### Patch Operations

```bash
# Generate patch
quack patch --from <version> --to <version> [options]

# List patches
quack patch list [--from <version>]

# Validate patch
quack patch validate <patch> --target <version>
```

## Error Handling

### Error Codes

```typescript
enum QuackErrorCode {
  ASSET_NOT_FOUND = 'ASSET_NOT_FOUND',
  COMPRESSION_FAILED = 'COMPRESSION_FAILED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  MANIFEST_INVALID = 'MANIFEST_INVALID',
  BUNDLE_CORRUPTED = 'BUNDLE_CORRUPTED',
  PLUGIN_ERROR = 'PLUGIN_ERROR',
  CONFIG_INVALID = 'CONFIG_INVALID',
}
```

### Error Handling Examples

```typescript
import { QuackBundler, QuackError } from '@quajs/quack'

try {
  const bundler = new QuackBundler(config)
  await bundler.bundle()
}
catch (error) {
  if (error instanceof QuackError) {
    switch (error.code) {
      case 'ASSET_NOT_FOUND':
        console.error(`Asset missing: ${error.asset}`)
        break
      case 'COMPRESSION_FAILED':
        console.error(`Compression error: ${error.message}`)
        break
      default:
        console.error(`Bundle error: ${error.message}`)
    }
  }
  else {
    console.error('Unexpected error:', error)
  }
}
```

## Environment Variables

```bash
# Encryption key
QUACK_ENCRYPTION_KEY=your-secret-key

# Build number for versioning
BUILD_NUMBER=123

# Enable verbose logging
QUACK_VERBOSE=true

# Memory limit for LZMA (MB)
QUACK_LZMA_MEMORY=256

# Default compression level
QUACK_COMPRESSION_LEVEL=6

# Temp directory
QUACK_TEMP_DIR=/tmp/quack
```
