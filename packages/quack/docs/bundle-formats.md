# Bundle Format Specifications

This document describes the bundle formats supported by Quack, including their structure, features, and use cases.

## Overview

Quack supports two primary bundle formats:

1. **ZIP Format** - Standard ZIP archives with JSON manifest
2. **QPK Format** - Custom binary format optimized for games

Both formats store assets and metadata in a structured way that enables efficient loading, validation, and patching.

## ZIP Format

### Structure

ZIP bundles follow the standard ZIP archive format with a specific internal structure:

```
bundle.zip
├── manifest.json          # Bundle metadata and asset index
├── assets/               # Asset files organized by type
│   ├── images/
│   │   ├── backgrounds/
│   │   ├── cg/
│   │   └── ui/
│   ├── characters/
│   ├── audio/
│   │   ├── bgm/
│   │   ├── sfx/
│   │   └── voice/
│   ├── video/
│   ├── scripts/
│   └── data/
└── integrity.json        # Asset integrity hashes (optional)
```

### Manifest Format

The `manifest.json` file contains complete bundle metadata:

```json
{
  "name": "my-game-bundle",
  "version": "1.0.0",
  "bundler": "@quajs/quack@0.1.0",
  "created": "2024-01-15T10:30:00.000Z",
  "createdAt": 1705312200000,
  "format": "zip",
  "bundleVersion": 1,
  "buildNumber": "20240115.1",
  "buildMetadata": {
    "branch": "main",
    "commit": "abc123def456",
    "buildTime": "2024-01-15T10:30:00.000Z",
    "builder": "CI/CD"
  },
  "compression": {
    "algorithm": "deflate",
    "level": 6
  },
  "encryption": {
    "enabled": false,
    "algorithm": "none"
  },
  "locales": ["default", "en-us", "zh-cn", "ja"],
  "defaultLocale": "default",
  "assets": {
    "images": {
      "backgrounds/main_menu.png": {
        "name": "main_menu.png",
        "path": "assets/images/backgrounds/main_menu.png",
        "relativePath": "images/backgrounds/main_menu.png",
        "size": 1024576,
        "hash": "sha256:abc123...",
        "type": "images",
        "subType": "backgrounds",
        "locales": ["default"],
        "mimeType": "image/png",
        "mtime": 1705312000000,
        "version": 1,
        "mediaMetadata": {
          "width": 1920,
          "height": 1080,
          "aspectRatio": 1.7777777777777777,
          "animated": false,
          "format": "PNG",
          "colorDepth": 8,
          "hasAlpha": true
        }
      }
    },
    "characters": {},
    "audio": {
      "bgm/theme.mp3": {
        "name": "theme.mp3",
        "path": "assets/audio/bgm/theme.mp3",
        "relativePath": "audio/bgm/theme.mp3",
        "size": 5242880,
        "hash": "sha256:def456...",
        "type": "audio",
        "subType": "bgm",
        "locales": ["default"],
        "mimeType": "audio/mpeg",
        "mtime": 1705312100000,
        "version": 1,
        "mediaMetadata": {
          "duration": 180.5,
          "format": "MP3",
          "bitrate": 192000,
          "sampleRate": 44100,
          "channels": 2
        }
      }
    },
    "video": {},
    "scripts": {},
    "data": {}
  },
  "totalSize": 6267456,
  "totalFiles": 2,
  "merkleRoot": "sha256:root123...",
  "performanceMetrics": {
    "estimatedLoadTime": 626,
    "estimatedDecompressionTime": 313,
    "memoryUsageEstimate": 9401184
  }
}
```

### Compression

ZIP bundles use the standard deflate compression algorithm with configurable levels:

- **Level 0**: No compression (store only)
- **Level 1-9**: Deflate compression (1=fastest, 9=best compression)
- **Default**: Level 6 (good balance)

### Encryption

ZIP format supports basic XOR encryption:

- Individual files are encrypted before compression
- Manifest remains unencrypted for metadata access
- Encryption key must be provided at runtime

### Advantages

- ✅ Standard format, widely supported
- ✅ Easy to inspect with standard tools
- ✅ Good compression with deflate
- ✅ Cross-platform compatibility
- ✅ Streaming extraction support

### Disadvantages

- ❌ Limited encryption options
- ❌ Larger overhead for many small files
- ❌ Less efficient compression than LZMA
- ❌ No built-in versioning or patching

## QPK Format (Quack Package)

### Overview

QPK is a custom binary format designed specifically for game asset bundles. It provides better compression, encryption support, and additional metadata capabilities.

### File Structure

```
QPK File Layout:
┌─────────────────────────┐
│ Header (32 bytes)       │
├─────────────────────────┤
│ Manifest (variable)     │
├─────────────────────────┤
│ Asset Index (variable)  │
├─────────────────────────┤
│ Asset Data (variable)   │
└─────────────────────────┘
```

### Header Format

```c
struct QPKHeader {
    char signature[4];      // "QPK\0"
    uint32_t version;       // Format version (1)
    uint32_t flags;         // Feature flags
    uint32_t manifestSize;  // Manifest size in bytes
    uint32_t indexSize;     // Asset index size in bytes
    uint64_t totalSize;     // Total file size
    uint32_t crc32;         // Header CRC32
    uint32_t reserved;      // Reserved for future use
};
```

### Feature Flags

```c
#define QPK_FLAG_COMPRESSED   0x01  // LZMA compression enabled
#define QPK_FLAG_ENCRYPTED    0x02  // XOR encryption enabled
#define QPK_FLAG_INDEXED      0x04  // Fast asset indexing
#define QPK_FLAG_STREAMING    0x08  // Streaming-optimized layout
#define QPK_FLAG_VERSIONED    0x10  // Version tracking enabled
#define QPK_FLAG_PATCHED      0x20  // Patch bundle
```

### Manifest Section

The manifest is stored as compressed JSON (if compression is enabled):

```json
{
  "format": "qpk",
  "version": "1.0.0",
  "compression": {
    "algorithm": "lzma",
    "level": 6,
    "dictionarySize": 1048576,
    "numFastBytes": 32
  },
  "encryption": {
    "enabled": true,
    "algorithm": "xor",
    "keyDerivation": "pbkdf2"
  }
  // ... rest similar to ZIP manifest
}
```

### Asset Index Format

The asset index provides fast lookup without decompressing asset data:

```c
struct AssetIndexEntry {
    char path[256];         // Relative asset path
    uint64_t offset;        // Offset in asset data section
    uint64_t compressedSize;// Compressed size
    uint64_t originalSize;  // Original size
    char hash[64];          // SHA-256 hash
    uint32_t flags;         // Asset-specific flags
    uint32_t reserved;      // Reserved
};
```

### Asset Data Section

Assets are stored sequentially, optionally compressed and/or encrypted:

1. **No compression/encryption**: Raw asset data
2. **Compression only**: LZMA-compressed data
3. **Encryption only**: XOR-encrypted data
4. **Both**: LZMA-compressed then XOR-encrypted

### Compression (LZMA)

QPK uses LZMA compression for superior compression ratios:

```json
{
  "algorithm": "lzma",
  "level": 6, // 1-9, higher = better compression
  "dictionarySize": 1048576, // Dictionary size in bytes
  "numFastBytes": 32, // Fast bytes parameter
  "matchFinder": "bt4", // Match finder algorithm
  "numHashBytes": 4 // Hash bytes count
}
```

### Encryption (XOR)

Enhanced XOR encryption with key derivation:

```json
{
  "algorithm": "xor",
  "keyDerivation": "pbkdf2",
  "iterations": 10000,
  "salt": "base64-encoded-salt"
}
```

### Advantages

- ✅ Superior LZMA compression (30-50% better than deflate)
- ✅ Enhanced encryption with key derivation
- ✅ Fast asset indexing without decompression
- ✅ Streaming-optimized layout
- ✅ Built-in version tracking
- ✅ Patch support with metadata
- ✅ Lower memory usage during extraction

### Disadvantages

- ❌ Custom format, requires specific tools
- ❌ Slower compression (LZMA is CPU-intensive)
- ❌ Not human-readable without tools

## Bundle Comparison

| Feature       | ZIP             | QPK                           |
| ------------- | --------------- | ----------------------------- |
| Compression   | Deflate (good)  | LZMA (excellent)              |
| Encryption    | Basic XOR       | Enhanced XOR + Key derivation |
| File size     | Larger          | Smaller (20-50% reduction)    |
| Compatibility | Universal       | Quack-specific                |
| Inspection    | Standard tools  | Custom tools required         |
| Streaming     | Limited         | Optimized                     |
| Patching      | External        | Built-in                      |
| Performance   | Fast decompress | Slower decompress, better I/O |

## Format Selection Guidelines

### Use ZIP when:

- Cross-platform compatibility is critical
- Need to inspect bundles with standard tools
- Working with legacy systems
- Prioritizing decompression speed over size
- Encryption is not required

### Use QPK when:

- Bundle size is critical (bandwidth/storage)
- Advanced encryption is needed
- Building game-specific tooling
- Streaming/progressive loading is important
- Need built-in versioning and patching

## Validation and Integrity

### Hash Verification

Both formats support multiple hash algorithms:

- **SHA-256**: Default, good security and performance
- **CRC32**: Fast, basic error detection
- **Blake3**: Future support, very fast

### Merkle Trees

For large bundles, Merkle trees provide efficient partial verification:

```json
{
  "merkleRoot": "sha256:root_hash",
  "merkleTree": {
    "hash": "sha256:root_hash",
    "left": {
      "hash": "sha256:left_hash",
      "path": "images/background.png"
    },
    "right": {
      "hash": "sha256:right_hash",
      "left": { /* sub-tree */ },
      "right": { /* sub-tree */ }
    }
  }
}
```

### Integrity Checking

```typescript
import { MetadataGenerator } from '@quajs/quack'

const generator = new MetadataGenerator()

// Verify bundle integrity
const { valid, errors } = await generator.verifyIntegrity(assets, manifest)

if (!valid) {
  console.error('Integrity check failed:', errors)
}
```

## Versioning and Patches

### Version Metadata

Both formats support comprehensive version tracking:

```json
{
  "bundleVersion": 1,
  "buildNumber": "20240115.1",
  "buildMetadata": {
    "branch": "main",
    "commit": "abc123def456",
    "buildTime": "2024-01-15T10:30:00.000Z",
    "builder": "GitHub Actions",
    "environment": "production"
  }
}
```

### Patch Bundles

Patch bundles contain incremental changes:

```json
{
  "isPatch": true,
  "patchVersion": 1001002, // fromVersion + toVersion
  "fromVersion": 1,
  "toVersion": 2,
  "changes": {
    "added": [
      {
        "path": "images/new_character.png",
        "operation": "added",
        "newHash": "sha256:...",
        "size": 1024576
      }
    ],
    "modified": [
      {
        "path": "scripts/main.js",
        "operation": "modified",
        "oldHash": "sha256:...",
        "newHash": "sha256:...",
        "size": 2048
      }
    ],
    "deleted": [
      {
        "path": "images/old_ui.png",
        "operation": "deleted",
        "oldHash": "sha256:..."
      }
    ]
  },
  "totalChanges": 3,
  "totalSize": 1026624
}
```

## Performance Considerations

### Memory Usage

| Format | Memory Usage | Notes                       |
| ------ | ------------ | --------------------------- |
| ZIP    | Higher       | Full decompression required |
| QPK    | Lower        | Streaming decompression     |

### Compression Speed

| Algorithm | Compression Speed | Decompression Speed | Ratio |
| --------- | ----------------- | ------------------- | ----- |
| None      | Instant           | Instant             | 1.0x  |
| Deflate   | Fast              | Very Fast           | 2-3x  |
| LZMA      | Slow              | Fast                | 3-5x  |

### Bundle Size Examples

Example game bundle (100MB of assets):

| Format | Algorithm | Size | Compression Time | Load Time |
| ------ | --------- | ---- | ---------------- | --------- |
| ZIP    | Deflate-6 | 45MB | 5s               | 1s        |
| QPK    | LZMA-6    | 25MB | 15s              | 2s        |
| QPK    | LZMA-9    | 22MB | 45s              | 2.5s      |

## Tool Support

### Creating Bundles

```bash
# Create ZIP bundle
quack bundle ./assets -o game.zip -f zip -c deflate:6

# Create QPK bundle
quack bundle ./assets -o game.qpk -f qpk -c lzma:6

# With encryption
quack bundle ./assets -o game.qpk -f qpk --encrypt --key myKey
```

### Inspecting Bundles

```bash
# List bundle contents
quack list game.zip
quack list game.qpk

# Show detailed info
quack info game.qpk

# Verify integrity
quack verify game.qpk
```

### Extracting Bundles

```bash
# Extract to directory
quack extract game.zip ./extracted/
quack extract game.qpk ./extracted/

# Extract specific files
quack extract game.qpk ./extracted/ --include "images/**"
```

## Migration Between Formats

### Convert ZIP to QPK

```bash
# Extract and repack
quack extract game.zip ./temp/
quack bundle ./temp/ -o game.qpk -f qpk -c lzma:6
```

### Convert QPK to ZIP

```bash
# Extract and repack
quack extract game.qpk ./temp/
quack bundle ./temp/ -o game.zip -f zip -c deflate:6
```

### Programmatic Conversion

```typescript
import { QPKBundler, QuackBundler, ZipBundler } from '@quajs/quack'

// Extract from ZIP
const zipBundler = new ZipBundler()
const { assets, manifest } = await zipBundler.readBundle('game.zip')

// Create QPK with same assets
const qpkBundler = new QPKBundler([], 'xor', 'myKey')
await qpkBundler.createBundle(assets, manifest, 'game.qpk', {
  compress: true,
  encrypt: true
})
```

## Future Enhancements

### Planned Features

1. **Streaming Compression**: Real-time compression during transfer
2. **Delta Compression**: More efficient patches using binary diffs
3. **Multi-format Support**: Hybrid bundles with format per asset type
4. **Cloud Integration**: Direct upload/download from cloud storage
5. **Signature Verification**: Digital signatures for bundle authenticity

### Format Extensions

1. **QPK v2**: Enhanced metadata, better compression
2. **Compression Algorithms**: Zstandard, Brotli support
3. **Encryption**: AES-256, ChaCha20 support
4. **Index Optimization**: Bloom filters for negative lookups
