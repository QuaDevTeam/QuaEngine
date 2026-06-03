# Media Metadata API Documentation

This document describes the media metadata extraction capabilities of Quack, including supported formats, extracted metadata, and usage examples.

## Overview

Quack automatically extracts metadata from media files during asset discovery and bundling. Images use Quack's lightweight header readers; modern audio/video containers use Mediabunny through Node `FilePathSource`; AVI, WMV/ASF, and FLV use Quack's metadata-only container readers. No external `ffprobe`/`mediainfo` binary is required. Mediabunny is included under MPL-2.0. This metadata includes dimensions, duration, format information, and other technical details that can be useful for optimization and runtime loading decisions.

## Supported Media Types

### Image Files

**Supported formats:** PNG, JPEG, GIF, WebP, BMP, SVG

```typescript
interface ImageMetadata {
  width: number // Image width in pixels
  height: number // Image height in pixels
  aspectRatio: number // Width/height ratio
  animated: boolean // True for animated GIFs/WebPs
  format: string // Format name (PNG, JPEG, etc.)
  colorDepth?: number // Bits per channel (8, 16, etc.)
  hasAlpha?: boolean // True if image has transparency
}
```

#### PNG Metadata

- Extracted from IHDR chunk
- Supports all PNG color types
- Detects alpha channel (RGBA, Grayscale+Alpha)
- Reports actual bit depth

```typescript
const metadata = await extractor.extractMetadata('image.png')
console.log(`PNG: ${metadata.width}x${metadata.height}`)
console.log(`Alpha: ${metadata.hasAlpha}`)
console.log(`Bit depth: ${metadata.colorDepth}`)
```

#### JPEG Metadata

- Parsed from SOF (Start of Frame) markers
- Supports SOF0, SOF1, SOF2, SOF3 markers
- No alpha channel support (always false)

```typescript
const metadata = await extractor.extractMetadata('photo.jpg')
console.log(`JPEG: ${metadata.width}x${metadata.height}`)
console.log(`Aspect ratio: ${metadata.aspectRatio}`)
```

#### GIF Metadata

- Supports both GIF87a and GIF89a
- Detects animation by counting image descriptors
- Always reports alpha support as true

```typescript
const metadata = await extractor.extractMetadata('animation.gif')
console.log(`GIF: ${metadata.width}x${metadata.height}`)
console.log(`Animated: ${metadata.animated}`)
```

#### WebP Metadata

- Supports VP8, VP8L, and VP8X formats
- Detects animation and alpha from flags
- Handles both lossy and lossless variants

```typescript
const metadata = await extractor.extractMetadata('image.webp')
console.log(`WebP: ${metadata.width}x${metadata.height}`)
console.log(`Animated: ${metadata.animated}`)
console.log(`Alpha: ${metadata.hasAlpha}`)
```

### Audio Files

**Supported formats:** MP3, WAV, OGG, M4A, FLAC, AAC

```typescript
interface AudioMetadata {
  duration: number // Duration in seconds
  format: string // Format name (MP3, WAV, etc.)
  bitrate?: number // Bitrate in bits per second
  sampleRate?: number // Sample rate in Hz
  channels?: number // Number of audio channels
}
```

#### WAV Metadata

- Read through Mediabunny's WAVE demuxer
- Extracts sample rate, channels, duration, and bitrate when available

```typescript
const metadata = await extractor.extractMetadata('audio.wav')
console.log(`WAV: ${metadata.duration}s`)
console.log(`Sample rate: ${metadata.sampleRate}Hz`)
console.log(`Channels: ${metadata.channels}`)
```

#### MP3 Metadata

- Read through Mediabunny's MP3 demuxer
- Uses Mediabunny duration computation first, then container/tag metadata as fallback
- Extracts sample rate, channel count, and average bitrate when available

```typescript
const metadata = await extractor.extractMetadata('music.mp3')
console.log(`MP3: ${metadata.duration}s`)
console.log(`Bitrate: ${metadata.bitrate} bps`)
```

#### Other Audio Metadata

- M4A is read through the ISO BMFF audio track
- FLAC, AAC, OGG/Vorbis, and OGG/Opus are read through Mediabunny's format demuxers
- If a supported extension cannot be structurally parsed, Quack keeps the format name and leaves numeric fields at `0`/`undefined`; treat that as an asset QA signal

### Video Files

**Supported formats:** MP4, WebM, AVI, MOV, MKV, M4V, WMV, FLV

```typescript
interface VideoMetadata {
  width: number // Display width in pixels
  height: number // Display height in pixels
  aspectRatio: number // Width/height ratio
  duration: number // Duration in seconds
  format: string // Format name (MP4, WebM, etc.)
  frameRate?: number // Average packet rate in frames per second
  bitrate?: number // Video bitrate in bits per second
  hasAudio?: boolean // True if video contains audio track
  codec?: string // Video codec name
}
```

- MP4/MOV/M4V metadata is read through Mediabunny's ISO BMFF/QuickTime support. Width and height are display dimensions, so rotation and pixel aspect ratio are already reflected when the container exposes them.
- WebM/MKV metadata is read through Mediabunny's Matroska/WebM support, including track dimensions, codec ID, duration, frame-rate packet stats, and audio-track presence.
- `frameRate` for Mediabunny-backed containers is the average video packet rate from `computePacketStats(100, { skipLiveWait: true })`.
- `codec` prefers Mediabunny's container-internal codec ID, then codec parameter string, then normalized codec.
- AVI metadata is read from RIFF `avih` and stream `strh`/`strf` chunks, including dimensions, duration, frame rate, codec FourCC, and audio-stream presence.
- WMV metadata is read from ASF file, stream, and codec-list objects, including dimensions, duration, bitrate, frame rate, codec, and audio-stream presence when present in the header.
- FLV metadata is read from `onMetaData` script tags, FLV tag headers, and AVC sequence headers when available; duration falls back to the final tag timestamp.
- If a supported extension cannot be structurally parsed, Quack keeps the format name and leaves numeric fields at `0`/`undefined`; treat that as an asset QA signal.

```typescript
const metadata = await extractor.extractMetadata('video.mp4')
console.log(`MP4: ${metadata.width}x${metadata.height}, ${metadata.duration}s`)
console.log(`Codec: ${metadata.codec}`)
```

## Usage Examples

### Basic Metadata Extraction

```typescript
import { MediaMetadataExtractor } from '@quajs/quack'

const extractor = new MediaMetadataExtractor()

// Extract from any supported media file
const metadata = await extractor.extractMetadata('./assets/image.png')

if (metadata) {
  console.log('Format:', metadata.format)

  // Type-specific properties
  if ('width' in metadata) {
    console.log(`Dimensions: ${metadata.width}x${metadata.height}`)
    console.log(`Aspect ratio: ${metadata.aspectRatio}`)
  }

  if ('duration' in metadata) {
    console.log(`Duration: ${metadata.duration} seconds`)
  }
}
```

### Integration with Asset Discovery

```typescript
import { AssetDetector } from '@quajs/quack'

const detector = new AssetDetector()
const assets = await detector.discoverAssets('./assets')

// Filter assets by metadata
const largeImages = assets.filter((asset) => {
  if (asset.type === 'images' && asset.mediaMetadata) {
    const meta = asset.mediaMetadata as ImageMetadata
    return meta.width > 1920 || meta.height > 1080
  }
  return false
})

const longAudio = assets.filter((asset) => {
  if (asset.type === 'audio' && asset.mediaMetadata) {
    const meta = asset.mediaMetadata as AudioMetadata
    return meta.duration > 60 // Longer than 1 minute
  }
  return false
})
```

### Aspect Ratio Analysis

```typescript
// Group images by aspect ratio
const aspectRatios = new Map()

assets
  .filter(asset => asset.type === 'images' && asset.mediaMetadata)
  .forEach((asset) => {
    const meta = asset.mediaMetadata as ImageMetadata
    const ratio = Math.round(meta.aspectRatio * 100) / 100 // Round to 2 decimals

    if (!aspectRatios.has(ratio)) {
      aspectRatios.set(ratio, [])
    }
    aspectRatios.get(ratio).push(asset)
  })

// Common aspect ratios
const widescreen = aspectRatios.get(1.78) || [] // 16:9
const standard = aspectRatios.get(1.33) || [] // 4:3
const square = aspectRatios.get(1.0) || [] // 1:1
```

### Animation Detection

```typescript
// Find all animated images
const animatedImages = assets.filter((asset) => {
  if ((asset.type === 'images' || asset.type === 'characters') && asset.mediaMetadata) {
    const meta = asset.mediaMetadata as ImageMetadata
    return meta.animated
  }
  return false
})

console.log(`Found ${animatedImages.length} animated images:`)
animatedImages.forEach((asset) => {
  const meta = asset.mediaMetadata as ImageMetadata
  console.log(`- ${asset.name} (${meta.format}, ${meta.width}x${meta.height})`)
})
```

### Audio Duration Summary

```typescript
// Calculate total audio duration
const totalDuration = assets
  .filter(asset => asset.type === 'audio' && asset.mediaMetadata)
  .reduce((total, asset) => {
    const meta = asset.mediaMetadata as AudioMetadata
    return total + meta.duration
  }, 0)

console.log(`Total audio: ${Math.round(totalDuration / 60)} minutes`)

// Group by audio format
const audioFormats = assets
  .filter(asset => asset.type === 'audio' && asset.mediaMetadata)
  .reduce((formats, asset) => {
    const meta = asset.mediaMetadata as AudioMetadata
    formats[meta.format] = (formats[meta.format] || 0) + 1
    return formats
  }, {} as Record<string, number>)

console.log('Audio formats:', audioFormats)
```

## Error Handling

The media extractor handles errors gracefully:

```typescript
try {
  const metadata = await extractor.extractMetadata('./corrupted-file.png')

  if (!metadata) {
    console.log('File format not supported or corrupted')
  }
  else {
    // Metadata may contain zeros for corrupted files
    if (metadata.width === 0 && metadata.height === 0) {
      console.log('Could not extract valid dimensions')
    }
  }
}
catch (error) {
  console.error('Extraction failed:', error.message)
}
```

## Performance Considerations

### File Reading

- Files are read completely into memory for parsing
- Consider memory usage for very large media files
- Processing is synchronous but wrapped in async interface

### Caching

The extractor doesn't cache results internally. For repeated operations, consider implementing your own caching:

```typescript
const metadataCache = new Map<string, MediaMetadata>()

async function getCachedMetadata(filePath: string): Promise<MediaMetadata | null> {
  if (metadataCache.has(filePath)) {
    return metadataCache.get(filePath)!
  }

  const metadata = await extractor.extractMetadata(filePath)
  if (metadata) {
    metadataCache.set(filePath, metadata)
  }

  return metadata
}
```

### Batch Processing

For processing many files, consider limiting concurrency:

```typescript
import { pLimit } from 'p-limit'

const limit = pLimit(5) // Process 5 files at once

const results = await Promise.all(
  filePaths.map(path =>
    limit(async () => {
      const metadata = await extractor.extractMetadata(path)
      return { path, metadata }
    })
  )
)
```

## Extending Metadata Extraction

### Custom File Format Support

To add support for additional formats, extend the MediaMetadataExtractor:

```typescript
import { MediaMetadataExtractor } from '@quajs/quack'

class ExtendedMetadataExtractor extends MediaMetadataExtractor {
  async extractMetadata(filePath: string) {
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.tiff') {
      return this.extractTiffMetadata(filePath)
    }

    // Fall back to parent implementation
    return super.extractMetadata(filePath)
  }

  private async extractTiffMetadata(filePath: string): Promise<ImageMetadata> {
    // Custom TIFF parsing logic
    // ...
  }
}
```

### Enhanced Metadata

You can extend the metadata interfaces for custom properties:

```typescript
interface ExtendedImageMetadata extends ImageMetadata {
  compressionType?: string
  iccProfile?: boolean
  exifData?: Record<string, any>
}
```

## Future Enhancements

Planned improvements to media metadata extraction:

### Video Support

- Subtitle track detection
- Deeper codec-specific dimension probing for AVI, WMV/ASF, and FLV beyond container metadata

### Enhanced Audio

- Metadata tags (ID3, Vorbis comments)
- Audio quality analysis
- Peak/RMS level detection

### Image Enhancements

- EXIF data extraction
- Color profile information
- Compression quality estimation
- Thumbnail extraction

### Performance

- Worker thread support
- Progressive metadata loading
