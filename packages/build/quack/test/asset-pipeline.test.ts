import type { AssetContext } from '../src/core/types'
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { QuackBundler } from '../src/core/bundler'
import { AssetPipelinePlugin } from '../src/plugins/asset-pipeline'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

describe('assetPipelinePlugin', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `quack-asset-pipeline-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('builds multiple target QPKs with target-specific image, audio, and video formats', async () => {
    const sourceDir = join(tempDir, 'assets')
    const outputDir = join(tempDir, 'dist')
    await mkdir(join(sourceDir, 'images'), { recursive: true })
    await mkdir(join(sourceDir, 'audio'), { recursive: true })
    await mkdir(join(sourceDir, 'video'), { recursive: true })
    await writeFile(join(sourceDir, 'images', 'bg.png'), createPng({ width: 16, height: 16 }))
    await writeFile(join(sourceDir, 'audio', 'voice.wav'), Buffer.from('audio-bytes'))
    await writeFile(join(sourceDir, 'video', 'intro.mp4'), Buffer.from('video-bytes'))
    const fakeTool = await createCopyTool(join(tempDir, 'copy-tool.mjs'))

    const bundler = new QuackBundler({
      source: sourceDir,
      output: join(outputDir, 'game.qpk'),
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'asset-target-test' },
      assetTargets: [
        {
          name: 'modern-webp',
          suffix: 'modern-webp',
          browserCondition: 'image/webp',
          pipeline: {
            images: { quality: 80 },
            audio: {},
            video: {},
          },
        },
        {
          name: 'fallback-png',
          suffix: 'fallback-png',
          pipeline: {
            images: { format: 'png', quality: 90 },
            audio: { format: 'wav' },
            video: { format: 'mp4' },
          },
        },
      ],
      plugins: [
        new AssetPipelinePlugin({
          tools: {
            audio: { binary: fakeTool, args: ['{input}', '{output}'] },
            video: { binary: fakeTool, args: ['{input}', '{output}'] },
          },
        }),
      ],
    })

    const stats = await bundler.bundle()

    expect(Object.keys(stats.targets || {})).toEqual(['modern-webp', 'fallback-png'])

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    expect(index.latestBundle).toBeUndefined()
    expect(index.targets['modern-webp'].filename).toContain('game.modern-webp.')
    expect(index.targets['fallback-png'].filename).toContain('game.fallback-png.')
    expect(index.targets['modern-webp'].assetTarget.formats.images).toBe('webp')
    expect(index.targets['modern-webp'].assetTarget.formats.audio).toBe('aac')
    expect(index.targets['modern-webp'].assetTarget.formats.video).toBe('webm')

    const webpBundlePath = join(outputDir, index.targets['modern-webp'].filename)
    const { manifest, assets } = await new QPKBundler().readBundle(webpBundlePath)
    const bundledImage = assets.get('assets/images/bg.png')
    const manifestImage = manifest.assets.images['bg.png']
    const manifestAudio = manifest.assets.audio['voice.wav']
    const manifestVideo = manifest.assets.video['intro.mp4']

    expect(manifest.assetTarget?.name).toBe('modern-webp')
    expect(manifestImage.mimeType).toBe('image/webp')
    expect(manifestImage.pipeline?.targetFormat).toBe('webp')
    expect(bundledImage?.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(bundledImage?.subarray(8, 12).toString('ascii')).toBe('WEBP')
    expect(manifestAudio.mimeType).toBe('audio/aac')
    expect(manifestAudio.pipeline?.targetFormat).toBe('aac')
    expect(manifestVideo.mimeType).toBe('video/webm')
    expect(manifestVideo.pipeline?.targetFormat).toBe('webm')

    const logFiles = await readdir(join(outputDir, '.quack-logs'))
    expect(logFiles).toEqual(expect.arrayContaining([
      'asset-target-test.modern-webp.json',
      'asset-target-test.fallback-png.json',
    ]))
    const modernLog = JSON.parse(await readFile(join(outputDir, '.quack-logs', 'asset-target-test.modern-webp.json'), 'utf8'))
    const fallbackLog = JSON.parse(await readFile(join(outputDir, '.quack-logs', 'asset-target-test.fallback-png.json'), 'utf8'))
    expect(modernLog.assetTarget.name).toBe('modern-webp')
    expect(fallbackLog.assetTarget.name).toBe('fallback-png')
  })

  it('updates image metadata after format conversion', async () => {
    const plugin = new AssetPipelinePlugin({
      pipeline: {
        images: { format: 'jpeg' },
      },
    })

    await plugin.initialize({})
    const buffer = createPng({ width: 12, height: 8 })
    const image: AssetContext = {
      asset: {
        name: 'bg.png',
        path: '/virtual/images/bg.png',
        relativePath: 'images/bg.png',
        size: buffer.length,
        hash: '0'.repeat(64),
        type: 'images',
        locales: ['default'],
        mimeType: 'image/png',
        mediaMetadata: { width: 12, height: 8, aspectRatio: 12 / 8, animated: false, format: 'PNG', hasAlpha: true },
      },
      buffer,
      metadata: {},
    }

    await plugin.processAsset(image)

    expect(image.asset.mimeType).toBe('image/jpeg')
    expect(image.asset.mediaMetadata).toEqual(expect.objectContaining({
      width: 12,
      height: 8,
      aspectRatio: 12 / 8,
      animated: false,
      format: 'JPEG',
      hasAlpha: false,
    }))
  })

  it('processes audio, video, and font assets through configurable external tools', async () => {
    const fakeTool = await createCopyTool(join(tempDir, 'copy-tool.mjs'))
    const plugin = new AssetPipelinePlugin({
      pipeline: {
        audio: {
          format: 'opus',
          externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
        },
        video: {
          format: 'webm',
          externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
        },
        fonts: {
          format: 'woff2',
          text: 'QuaEngine',
          externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
        },
      },
    })

    await plugin.initialize({})

    const audio = createContext('audio', 'audio/voice.wav', 'voice.wav', 'audio/wav', Buffer.from('audio-bytes'))
    await plugin.processAsset(audio)
    expect(audio.asset.mimeType).toBe('audio/ogg; codecs=opus')
    expect(audio.asset.mediaMetadata?.format).toBe('OPUS')
    expect(audio.asset.pipeline?.tool).toBe(fakeTool)
    expect(Buffer.from(audio.asset.content!)).toEqual(Buffer.from('audio-bytes'))

    const video = createContext('video', 'video/intro.mp4', 'intro.mp4', 'video/mp4', Buffer.from('video-bytes'))
    await plugin.processAsset(video)
    expect(video.asset.mimeType).toBe('video/webm')
    expect(video.asset.mediaMetadata?.format).toBe('WEBM')
    expect(video.asset.pipeline?.tool).toBe(fakeTool)
    expect(Buffer.from(video.asset.content!)).toEqual(Buffer.from('video-bytes'))

    const font = createContext('fonts', 'fonts/display.ttf', 'display.ttf', 'font/ttf', Buffer.from('font-bytes'))
    await plugin.processAsset(font)
    expect(font.asset.mimeType).toBe('font/woff2')
    expect(Buffer.from(font.asset.content!)).toEqual(Buffer.from('font-bytes'))
  })

  it('generates default ffmpeg args for audio and video pipelines', async () => {
    const logPath = join(tempDir, 'ffmpeg-log.json')
    const fakeFfmpeg = await createRecordingTool(join(tempDir, 'ffmpeg-fake.mjs'), logPath)
    const plugin = new AssetPipelinePlugin({
      pipeline: {
        audio: {
          bitrate: '128k',
          loudnessNormalization: true,
          extraArgs: ['-vn'],
        },
        video: {
          format: 'mp4',
          crf: 23,
          width: 1280,
          height: 720,
          fps: 30,
          pixelFormat: 'yuv420p',
          extraArgs: ['-map_metadata', '-1'],
        },
      },
      tools: {
        audio: { binary: fakeFfmpeg },
        video: { binary: fakeFfmpeg },
      },
    })

    await plugin.initialize({})
    await plugin.processAsset(createContext('audio', 'audio/voice.wav', 'voice.wav', 'audio/wav', Buffer.from('audio-bytes')))
    await plugin.processAsset(createContext('video', 'video/intro.mp4', 'intro.mp4', 'video/mp4', Buffer.from('video-bytes')))

    const calls = JSON.parse(await readFile(logPath, 'utf8')) as Array<{ args: string[] }>
    const audioArgs = calls[0].args
    const videoArgs = calls[1].args

    expect(audioArgs).toEqual(expect.arrayContaining(['-c:a', 'aac', '-b:a', '128k', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-vn']))
    expect(audioArgs.at(-1)).toMatch(/output\.aac$/)
    expect(videoArgs).toEqual(expect.arrayContaining([
      '-vf',
      'scale=1280:720',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-map_metadata',
      '-1',
    ]))
    expect(videoArgs.at(-1)).toMatch(/output\.mp4$/)

    const overrideLogPath = join(tempDir, 'override-log.json')
    const overrideTool = await createRecordingTool(join(tempDir, 'override-ffmpeg-fake.mjs'), overrideLogPath)
    const overridePlugin = new AssetPipelinePlugin({
      pipeline: {
        audio: {
          externalTool: {
            binary: overrideTool,
            args: ['--custom-audio', '{input}', '{output}'],
          },
        },
      },
    })
    await overridePlugin.initialize({})
    await overridePlugin.processAsset(createContext('audio', 'audio/voice.wav', 'voice.wav', 'audio/wav', Buffer.from('audio-bytes')))

    const overrideCalls = JSON.parse(await readFile(overrideLogPath, 'utf8')) as Array<{ args: string[] }>
    expect(overrideCalls[0].args[0]).toBe('--custom-audio')
    expect(overrideCalls[0].args).toHaveLength(3)

    const webmLogPath = join(tempDir, 'webm-log.json')
    const webmTool = await createRecordingTool(join(tempDir, 'webm-ffmpeg-fake.mjs'), webmLogPath)
    const webmPlugin = new AssetPipelinePlugin({
      pipeline: {
        video: {
          crf: 32,
        },
      },
      tools: {
        video: { binary: webmTool },
      },
    })
    await webmPlugin.initialize({})
    await webmPlugin.processAsset(createContext('video', 'video/intro.mp4', 'intro.mp4', 'video/mp4', Buffer.from('video-bytes')))

    const webmCalls = JSON.parse(await readFile(webmLogPath, 'utf8')) as Array<{ args: string[] }>
    expect(webmCalls[0].args).toEqual(expect.arrayContaining([
      '-c:v',
      'libvpx-vp9',
      '-c:a',
      'libopus',
      '-b:v',
      '0',
      '-crf',
      '32',
    ]))
    expect(webmCalls[0].args.at(-1)).toMatch(/output\.webm$/)
  })

  it('rewrites media extensions only when requested', async () => {
    const fakeTool = await createCopyTool(join(tempDir, 'copy-tool.mjs'))
    const plugin = new AssetPipelinePlugin({
      pipeline: {
        audio: {
          rewriteExtension: true,
          externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
        },
        video: {
          rewriteExtension: true,
          externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
        },
      },
    })

    await plugin.initialize({})
    const audio = createContext('audio', 'audio/voice.wav', 'voice.wav', 'audio/wav', Buffer.from('audio-bytes'))
    const video = createContext('video', 'video/intro.mp4', 'intro.mp4', 'video/mp4', Buffer.from('video-bytes'))

    await plugin.processAsset(audio)
    await plugin.processAsset(video)

    expect(audio.asset.relativePath).toBe('audio/voice.aac')
    expect(audio.asset.name).toBe('voice.aac')
    expect(video.asset.relativePath).toBe('video/intro.webm')
    expect(video.asset.name).toBe('intro.webm')
  })

  it('skips optional targets that fail and fails required targets', async () => {
    const sourceDir = join(tempDir, 'assets')
    const outputDir = join(tempDir, 'dist')
    await mkdir(join(sourceDir, 'audio'), { recursive: true })
    await writeFile(join(sourceDir, 'audio', 'voice.wav'), Buffer.from('audio-bytes'))
    const fakeTool = await createCopyTool(join(tempDir, 'copy-tool.mjs'))

    const bundler = new QuackBundler({
      source: sourceDir,
      output: join(outputDir, 'game.qpk'),
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'optional-target-test' },
      assetTargets: [
        {
          name: 'optional-broken',
          suffix: 'optional-broken',
          optional: true,
          pipeline: { audio: {} },
        },
        {
          name: 'working-aac',
          suffix: 'working-aac',
          pipeline: {
            audio: {
              externalTool: { binary: fakeTool, args: ['{input}', '{output}'] },
            },
          },
        },
      ],
      plugins: [
        new AssetPipelinePlugin({
          tools: {
            audio: { binary: join(tempDir, 'missing-ffmpeg') },
          },
        }),
      ],
    })

    await bundler.bundle()
    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    expect(index.targets['optional-broken']).toBeUndefined()
    expect(index.targets['working-aac']).toBeDefined()

    const requiredBundler = new QuackBundler({
      source: sourceDir,
      output: join(outputDir, 'required.qpk'),
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'required-target-test' },
      assetTargets: [
        {
          name: 'required-broken',
          suffix: 'required-broken',
          pipeline: { audio: {} },
        },
      ],
      plugins: [
        new AssetPipelinePlugin({
          tools: {
            audio: { binary: join(tempDir, 'missing-ffmpeg') },
          },
        }),
      ],
    })

    await expect(requiredBundler.bundle()).rejects.toThrow('Asset processing failed: asset-pipeline')
  })
})

async function createCopyTool(path: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
import { copyFileSync } from 'node:fs'
const input = process.argv[2]
const output = process.argv[3]
copyFileSync(input, output)
`,
    'utf8',
  )
  await chmod(path, 0o755)
  return path
}

async function createRecordingTool(path: string, logPath: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const inputIndex = args.indexOf('-i')
const input = inputIndex >= 0 ? args[inputIndex + 1] : args.find(arg => existsSync(arg))
const output = args[args.length - 1]
const calls = existsSync('${logPath}') ? JSON.parse(readFileSync('${logPath}', 'utf8')) : []
calls.push({ args })
writeFileSync('${logPath}', JSON.stringify(calls))
copyFileSync(input, output)
`,
    'utf8',
  )
  await chmod(path, 0o755)
  return path
}

function createContext(
  type: 'audio' | 'video' | 'fonts',
  relativePath: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): AssetContext {
  return {
    asset: {
      name,
      path: `/virtual/${relativePath}`,
      relativePath,
      size: buffer.length,
      hash: '0'.repeat(64),
      type,
      locales: ['default'],
      mimeType,
      mediaMetadata: type === 'fonts'
        ? undefined
        : type === 'audio'
          ? { duration: 1, format: 'WAV' }
          : { width: 1920, height: 1080, aspectRatio: 16 / 9, duration: 1, format: 'MP4' },
    },
    buffer,
    metadata: {},
  }
}

function createPng(options: {
  width: number
  height: number
}): Buffer {
  const rows: Buffer[] = []
  for (let y = 0; y < options.height; y++) {
    const row = Buffer.alloc(1 + options.width * 4)
    row[0] = 0

    for (let x = 0; x < options.width; x++) {
      const offset = 1 + x * 4
      row[offset] = 255
      row[offset + 1] = y % 2 === 0 ? 0 : 32
      row[offset + 2] = x % 2 === 0 ? 0 : 32
      row[offset + 3] = 255
    }

    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(options.width, 0)
  ihdr.writeUInt32BE(options.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const chunks = [
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: 0 })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]

  const png = Buffer.concat([PNG_SIGNATURE, ...chunks])
  expectPngDataCanInflate(png)
  return png
}

function expectPngDataCanInflate(buffer: Buffer): void {
  const idat = Buffer.concat(readPngChunks(buffer)
    .filter(chunk => chunk.type === 'IDAT')
    .map(chunk => chunk.data))

  expect(inflateSync(idat).length).toBeGreaterThan(0)
}

function readPngChunks(buffer: Buffer): Array<{ type: string, data: Buffer }> {
  const chunks: Array<{ type: string, data: Buffer }> = []
  let offset = PNG_SIGNATURE.length

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    offset += 4
    const data = buffer.subarray(offset, offset + length)
    offset += length + 4
    chunks.push({ type, data })

    if (type === 'IEND') {
      break
    }
  }

  return chunks
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

let crcTable: number[] | undefined

function crc32(buffer: Buffer): number {
  const table = getCrcTable()
  let crc = 0xFFFFFFFF

  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }

  return (crc ^ 0xFFFFFFFF) >>> 0
}

function getCrcTable(): number[] {
  if (crcTable) {
    return crcTable
  }

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    }
    return value >>> 0
  })

  return crcTable
}
