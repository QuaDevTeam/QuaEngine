# Media Metadata API Documentation

This document describes the media metadata extraction capabilities of Quack, including supported formats, extracted metadata, and usage examples.

## Overview

Quack automatically extracts metadata from media files during asset discovery and bundling. This metadata includes dimensions, duration, format information, and other technical details that can be useful for optimization and runtime loading decisions.

## Supported Media Types

### Image Files

**Supported formats:** PNG, JPEG, GIF, WebP, BMP, SVG

```typescript
interface ImageMetadata {
  width: number          // Image width in pixels
  height: number         // Image height in pixels
  aspectRatio: number    // Width/height ratio
  animated: boolean      // True for animated GIFs/WebPs
  format: string         // Format name (PNG, JPEG, etc.)
  colorDepth?: number    // Bits per channel (8, 16, etc.)
  hasAlpha?: boolean     // True if image has transparency
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
  duration: number       // Duration in seconds
  format: string         // Format name (MP3, WAV, etc.)
  bitrate?: number       // Bitrate in bits per second
  sampleRate?: number    // Sample rate in Hz
  channels?: number      // Number of audio channels
}
```

#### WAV Metadata

- Parsed from RIFF/WAVE headers
- Extracts sample rate, channels, bit depth
- Calculates duration from data size and byte rate

```typescript
const metadata = await extractor.extractMetadata('audio.wav')
console.log(`WAV: ${metadata.duration}s`)
console.log(`Sample rate: ${metadata.sampleRate}Hz`)
console.log(`Channels: ${metadata.channels}`)
```

#### MP3 Metadata

- Currently provides estimated values
- Duration estimated from file size and assumed bitrate
- Future versions will include full MP3 frame parsing

```typescript
const metadata = await extractor.extractMetadata('music.mp3')
console.log(`MP3: ${metadata.duration}s (estimated)`)
console.log(`Bitrate: ${metadata.bitrate} bps (estimated)`)
```

### Video Files

**Supported formats:** MP4, WebM, AVI, MOV, MKV, WMV, FLV

```typescript
interface VideoMetadata {
  width: number          // Video width in pixels
  height: number         // Video height in pixels
  aspectRatio: number    // Width/height ratio
  duration: number       // Duration in seconds
  format: string         // Format name (MP4, WebM, etc.)
  frameRate?: number     // Frames per second
  bitrate?: number       // Video bitrate in bits per second
  hasAudio?: boolean     // True if video contains audio track
  codec?: string         // Video codec name
}
```

**Note:** Video metadata extraction is currently limited to format detection. Full metadata extraction requires additional dependencies and will be implemented in future versions.

```typescript
const metadata = await extractor.extractMetadata('video.mp4')
console.log(`MP4: ${metadata.format}`)
// Width, height, duration currently return 0
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
const largeImages = assets.filter(asset => {
  if (asset.type === 'images' && asset.mediaMetadata) {
    const meta = asset.mediaMetadata as ImageMetadata
    return meta.width > 1920 || meta.height > 1080
  }
  return false
})

const longAudio = assets.filter(asset => {
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
  .forEach(asset => {
    const meta = asset.mediaMetadata as ImageMetadata
    const ratio = Math.round(meta.aspectRatio * 100) / 100 // Round to 2 decimals
    
    if (!aspectRatios.has(ratio)) {
      aspectRatios.set(ratio, [])
    }
    aspectRatios.get(ratio).push(asset)
  })

// Common aspect ratios
const widescreen = aspectRatios.get(1.78) || [] // 16:9
const standard = aspectRatios.get(1.33) || []   // 4:3
const square = aspectRatios.get(1.0) || []      // 1:1
```

### Animation Detection

```typescript
// Find all animated images
const animatedImages = assets.filter(asset => {
  if ((asset.type === 'images' || asset.type === 'characters') && asset.mediaMetadata) {
    const meta = asset.mediaMetadata as ImageMetadata
    return meta.animated
  }
  return false
})

console.log(`Found ${animatedImages.length} animated images:`)
animatedImages.forEach(asset => {
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
  } else {
    // Metadata may contain zeros for corrupted files
    if (metadata.width === 0 && metadata.height === 0) {
      console.log('Could not extract valid dimensions')
    }
  }
} catch (error) {
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
- Full MP4/MOV container parsing
- Codec detection (H.264, H.265, VP9, etc.)
- Audio track analysis
- Subtitle track detection

### Enhanced Audio
- Full MP3 frame parsing for accurate duration
- Metadata tags (ID3, Vorbis comments)
- Audio quality analysis
- Peak/RMS level detection

### Image Enhancements  
- EXIF data extraction
- Color profile information
- Compression quality estimation
- Thumbnail extraction

### Performance
- Streaming parsers for large files
- Worker thread support
- Progressive metadata loading
- Smart file sampling for estimates