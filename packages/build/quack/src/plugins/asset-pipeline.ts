import type {
  AssetContext,
  AssetPipelineExternalTool,
  AssetPipelineOptions,
  AudioPipelineFormat,
  AudioPipelineOptions,
  FontPipelineFormat,
  FontPipelineOptions,
  ImageMetadata,
  ImagePipelineFormat,
  ImagePipelineOptions,
  MediaMetadata,
  QuackConfig,
  VideoPipelineFormat,
  VideoPipelineOptions,
} from '../core/types'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { createLogger } from '@quajs/logger'
import { MediaMetadataExtractor } from '../assets/media-extractor'
import { QuackPlugin } from '../core/types'
import { ImageOptimizationPlugin } from './image-optimization'

const logger = createLogger('quack:plugins:asset-pipeline')

type SharpFactory = typeof import('sharp')

export interface AssetPipelinePluginOptions {
  enabled?: boolean
  pipeline?: AssetPipelineOptions
  tools?: {
    jxl?: AssetPipelineExternalTool
    audio?: AssetPipelineExternalTool
    video?: AssetPipelineExternalTool
    fonts?: AssetPipelineExternalTool
  }
}

interface ExternalTransformRequest {
  buffer: Buffer
  inputExtension: string
  outputExtension: string
  tool: Required<AssetPipelineExternalTool>
  args: string[]
  extractMetadata?: boolean
}

interface ExternalTransformResult {
  buffer: Buffer
  metadata?: MediaMetadata
  warning?: string
}

const IMAGE_MIME_TYPES: Record<Exclude<ImagePipelineFormat, 'source'>, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
}

const AUDIO_MIME_TYPES: Record<Exclude<AudioPipelineFormat, 'source'>, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
}

const VIDEO_MIME_TYPES: Record<Exclude<VideoPipelineFormat, 'source'>, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
}

const FONT_MIME_TYPES: Record<Exclude<FontPipelineFormat, 'source'>, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.jxl'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.opus', '.aac', '.m4a', '.flac', '.wav'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.wmv', '.flv'])
const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf', '.ttc'])

export class AssetPipelinePlugin extends QuackPlugin {
  name = 'asset-pipeline'
  version = '1.0.0'

  private enabled: boolean
  private options: AssetPipelinePluginOptions
  private pipeline: AssetPipelineOptions = {}
  private sharpModule?: SharpFactory | null
  private warnedSharpUnavailable = false
  private mediaExtractor = new MediaMetadataExtractor()

  constructor(options: AssetPipelinePluginOptions = {}) {
    super()
    this.options = options
    this.enabled = options.enabled ?? true
  }

  async initialize(config: QuackConfig): Promise<void> {
    if (!this.enabled) {
      logger.info('Asset pipeline plugin disabled')
      return
    }

    this.pipeline = config.assetTarget?.pipeline ?? this.options.pipeline ?? {}
    const targetName = config.assetTarget?.name ? ` for target "${config.assetTarget.name}"` : ''
    logger.info(`Asset pipeline plugin initialized${targetName}`)
  }

  async processAsset(context: AssetContext): Promise<void> {
    if (!this.enabled) {
      return
    }

    if (isImageContext(context)) {
      const options = context.asset.type === 'characters'
        ? this.pipeline.characters ?? this.pipeline.images
        : this.pipeline.images
      if (options) {
        await this.processImage(context, options)
      }
      return
    }

    if (isAudioContext(context) && this.pipeline.audio) {
      await this.processAudio(context, this.pipeline.audio)
      return
    }

    if (isVideoContext(context) && this.pipeline.video) {
      await this.processVideo(context, this.pipeline.video)
      return
    }

    if (isFontContext(context) && this.pipeline.fonts) {
      await this.processFont(context, this.pipeline.fonts)
    }
  }

  async cleanup(): Promise<void> {
    this.pipeline = {}
  }

  private async processImage(context: AssetContext, options: ImagePipelineOptions): Promise<void> {
    const format = options.format ?? 'webp'

    if (options.skipAnimated !== false && context.asset.mediaMetadata && 'animated' in context.asset.mediaMetadata && context.asset.mediaMetadata.animated) {
      return
    }

    if (format === 'source') {
      if (options.optimize === false) {
        return
      }

      await new ImageOptimizationPlugin({
        quality: options.quality,
        progressive: options.progressive,
        stripMetadata: options.stripMetadata,
        sharp: true,
        pngquant: options.pngquant,
        skipAnimated: options.skipAnimated,
      }).processAsset(context)
      return
    }

    const converted = format === 'jxl'
      ? await this.convertImageWithExternalTool(context.buffer, format, options, extname(context.asset.name) || '.img')
      : await this.convertImageWithSharp(context.buffer, format, options)
    const metadata = format === 'jxl'
      ? undefined
      : await this.extractImageMetadata(converted, format)

    this.applyTransformedAsset(context, converted, {
      format,
      mimeType: IMAGE_MIME_TYPES[format],
      extension: imageExtension(format),
      rewriteExtension: options.rewriteExtension ?? false,
      metadata,
      tool: format === 'jxl' ? normalizeTool(options.externalTool ?? this.options.tools?.jxl, 'cjxl').binary : 'sharp',
    })
  }

  private async processAudio(context: AssetContext, options: AudioPipelineOptions): Promise<void> {
    const format = options.format ?? 'aac'
    if (format === 'source') {
      return
    }

    const extension = audioExtension(format)
    const toolOptions = options.externalTool ?? this.options.tools?.audio
    const tool = normalizeTool(toolOptions, 'ffmpeg')
    const args = toolOptions?.args ?? defaultAudioArgs(format, options)
    const converted = await this.runExternalTransform({
      buffer: context.buffer,
      inputExtension: extname(context.asset.name) || '.audio',
      outputExtension: extension,
      tool,
      args,
      extractMetadata: true,
    })

    this.applyTransformedAsset(context, converted.buffer, {
      format,
      mimeType: AUDIO_MIME_TYPES[format],
      extension,
      rewriteExtension: options.rewriteExtension ?? false,
      metadata: converted.metadata,
      warning: converted.warning,
      tool: tool.binary,
    })
  }

  private async processVideo(context: AssetContext, options: VideoPipelineOptions): Promise<void> {
    const format = options.format ?? 'webm'
    if (format === 'source') {
      return
    }

    const extension = videoExtension(format)
    const toolOptions = options.externalTool ?? this.options.tools?.video
    const tool = normalizeTool(toolOptions, 'ffmpeg')
    const args = toolOptions?.args ?? defaultVideoArgs(format, options)
    const converted = await this.runExternalTransform({
      buffer: context.buffer,
      inputExtension: extname(context.asset.name) || '.video',
      outputExtension: extension,
      tool,
      args,
      extractMetadata: true,
    })

    this.applyTransformedAsset(context, converted.buffer, {
      format,
      mimeType: VIDEO_MIME_TYPES[format],
      extension,
      rewriteExtension: options.rewriteExtension ?? false,
      metadata: converted.metadata,
      warning: converted.warning,
      tool: tool.binary,
    })
  }

  private async processFont(context: AssetContext, options: FontPipelineOptions): Promise<void> {
    const format = options.format ?? 'source'
    const extension = format === 'source' ? extname(context.asset.name) || '.font' : fontExtension(format)
    const toolOptions = options.externalTool ?? this.options.tools?.fonts
    const tool = normalizeTool(toolOptions, 'pyftsubset')
    const args = toolOptions?.args ?? defaultFontArgs(format, options)
    const transformed = await this.runExternalTransform({
      buffer: context.buffer,
      inputExtension: extname(context.asset.name) || '.font',
      outputExtension: extension,
      tool,
      args,
    })

    this.applyTransformedAsset(context, transformed.buffer, {
      format,
      mimeType: format === 'source' ? context.asset.mimeType : FONT_MIME_TYPES[format],
      extension,
      rewriteExtension: options.rewriteExtension ?? false,
      tool: tool.binary,
    })
  }

  private async convertImageWithSharp(
    buffer: Buffer,
    format: Exclude<ImagePipelineFormat, 'source' | 'jxl'>,
    options: ImagePipelineOptions,
  ): Promise<Buffer> {
    const sharp = await this.loadSharp()
    if (!sharp) {
      throw new Error('sharp is required for image pipeline conversion')
    }

    let pipeline = sharp(buffer, {
      animated: false,
      failOn: 'none',
    })

    if (options.stripMetadata === false) {
      pipeline = pipeline.withMetadata()
    }

    if (format === 'png') {
      return await pipeline.png({
        adaptiveFiltering: true,
        compressionLevel: 9,
        effort: clampInteger(options.effort ?? 6, 1, 10),
        quality: clampInteger(options.quality ?? 85, 1, 100),
      }).toBuffer()
    }

    if (format === 'jpeg') {
      return await pipeline.jpeg({
        quality: clampInteger(options.quality ?? 85, 1, 100),
        progressive: options.progressive ?? true,
        mozjpeg: true,
      }).toBuffer()
    }

    if (format === 'webp') {
      return await pipeline.webp({
        effort: clampInteger(options.effort ?? 6, 0, 6),
        quality: clampInteger(options.quality ?? 85, 1, 100),
      }).toBuffer()
    }

    return await pipeline.avif({
      effort: clampInteger(options.effort ?? 6, 0, 9),
      quality: clampInteger(options.quality ?? 85, 1, 100),
    }).toBuffer()
  }

  private async convertImageWithExternalTool(
    buffer: Buffer,
    format: Exclude<ImagePipelineFormat, 'source' | 'png' | 'jpeg' | 'webp' | 'avif'>,
    options: ImagePipelineOptions,
    inputExtension: string,
  ): Promise<Buffer> {
    const extension = imageExtension(format)
    const toolOptions = options.externalTool ?? this.options.tools?.jxl
    const tool = normalizeTool(toolOptions, 'cjxl')
    const args = toolOptions?.args ?? defaultJxlArgs(options)
    return (await this.runExternalTransform({
      buffer,
      inputExtension,
      outputExtension: extension,
      tool,
      args,
    })).buffer
  }

  private async extractImageMetadata(
    buffer: Buffer,
    format: Exclude<ImagePipelineFormat, 'source' | 'jxl'>,
  ): Promise<ImageMetadata | undefined> {
    const sharp = await this.loadSharp()
    if (!sharp) {
      return undefined
    }

    try {
      const metadata = await sharp(buffer, {
        animated: false,
        failOn: 'none',
      }).metadata()
      if (!metadata.width || !metadata.height) {
        return undefined
      }

      return {
        width: metadata.width,
        height: metadata.height,
        aspectRatio: metadata.width / metadata.height,
        animated: (metadata.pages ?? 1) > 1,
        format: format.toUpperCase(),
        hasAlpha: metadata.hasAlpha ?? false,
      }
    }
    catch {
      return undefined
    }
  }

  private async runExternalTransform(request: ExternalTransformRequest): Promise<ExternalTransformResult> {
    const directory = await mkdtemp(join(tmpdir(), 'quack-asset-pipeline-'))
    const inputPath = join(directory, `input${request.inputExtension}`)
    const outputPath = join(directory, `output${request.outputExtension}`)

    try {
      await writeFile(inputPath, request.buffer)
      await runCommand(
        request.tool.binary,
        request.args.map(arg => arg.replaceAll('{input}', inputPath).replaceAll('{output}', outputPath)),
        request.tool.timeoutMs,
      )
      const buffer = await readFile(outputPath)
      if (!request.extractMetadata) {
        return { buffer }
      }

      try {
        const metadata = await this.mediaExtractor.extractMetadata(outputPath)
        return {
          buffer,
          metadata: metadata || undefined,
          warning: metadata ? undefined : 'metadata-unavailable',
        }
      }
      catch (error) {
        return {
          buffer,
          warning: `metadata-unavailable: ${getErrorMessage(error)}`,
        }
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private applyTransformedAsset(
    context: AssetContext,
    buffer: Buffer,
    options: {
      format: string
      mimeType?: string
      extension: string
      rewriteExtension: boolean
      metadata?: MediaMetadata
      warning?: string
      tool?: string
    },
  ): void {
    const originalSize = context.buffer.length
    const sourceFormat = context.asset.mediaMetadata?.format
    const sourceMimeType = context.asset.mimeType
    context.buffer = buffer
    context.asset.content = buffer
    context.asset.size = buffer.length
    context.asset.hash = calculateHash(buffer)
    context.asset.mimeType = options.mimeType
    context.asset.mediaMetadata = options.metadata
      ? updateMediaFormat(options.metadata, options.format)
      : updateMediaFormat(context.asset.mediaMetadata, options.format)

    if (options.rewriteExtension) {
      context.asset.relativePath = replaceExtension(context.asset.relativePath, options.extension)
      context.asset.path = replaceExtension(context.asset.path, options.extension)
      context.asset.name = replaceExtension(context.asset.name, options.extension)
    }

    const pipelineResult = {
      kind: context.asset.type as 'images' | 'characters' | 'audio' | 'video' | 'fonts',
      sourceFormat,
      sourceMimeType,
      targetFormat: options.format,
      targetMimeType: options.mimeType,
      tool: options.tool,
      originalSize,
      outputSize: buffer.length,
      savedBytes: originalSize - buffer.length,
      warning: options.warning,
    }
    context.asset.pipeline = pipelineResult
    context.metadata.assetPipeline = pipelineResult

    logger.debug(`Processed ${context.asset.relativePath} through ${context.asset.type} pipeline (${options.format})`)
  }

  private async loadSharp(): Promise<SharpFactory | null> {
    if (this.sharpModule !== undefined) {
      return this.sharpModule
    }

    try {
      const module = await import('sharp')
      this.sharpModule = (module as unknown as { default: SharpFactory }).default
    }
    catch {
      if (!this.warnedSharpUnavailable) {
        this.warnedSharpUnavailable = true
        logger.warn('sharp is unavailable; image conversion cannot run')
      }
      this.sharpModule = null
    }

    return this.sharpModule
  }
}

function isImageContext(context: AssetContext): boolean {
  if (context.asset.type !== 'images' && context.asset.type !== 'characters') {
    return false
  }
  if (context.asset.mimeType === 'image/svg+xml') {
    return false
  }
  return context.asset.mimeType?.startsWith('image/') === true || IMAGE_EXTENSIONS.has(extname(context.asset.name).toLowerCase())
}

function isAudioContext(context: AssetContext): boolean {
  return context.asset.type === 'audio'
    && (context.asset.mimeType?.startsWith('audio/') === true || AUDIO_EXTENSIONS.has(extname(context.asset.name).toLowerCase()))
}

function isVideoContext(context: AssetContext): boolean {
  return context.asset.type === 'video'
    && (context.asset.mimeType?.startsWith('video/') === true || VIDEO_EXTENSIONS.has(extname(context.asset.name).toLowerCase()))
}

function isFontContext(context: AssetContext): boolean {
  return context.asset.type === 'fonts'
    && (context.asset.mimeType?.startsWith('font/') === true || FONT_EXTENSIONS.has(extname(context.asset.name).toLowerCase()))
}

function normalizeTool(tool: AssetPipelineExternalTool | undefined, defaultBinary: string): Required<AssetPipelineExternalTool> {
  return {
    binary: tool?.binary ?? defaultBinary,
    args: tool?.args ?? [],
    timeoutMs: Math.max(1000, tool?.timeoutMs ?? 120000),
  }
}

function defaultJxlArgs(options: ImagePipelineOptions): string[] {
  return [
    '{input}',
    '{output}',
    '--quality',
    String(clampInteger(options.quality ?? 85, 1, 100)),
    '--effort',
    String(clampInteger(options.effort ?? 7, 1, 9)),
  ]
}

function defaultAudioArgs(format: Exclude<AudioPipelineFormat, 'source'>, options: AudioPipelineOptions): string[] {
  const args = ['-y', '-i', '{input}']
  const codec = options.codec ?? defaultAudioCodec(format)
  if (codec) {
    args.push('-c:a', codec)
  }
  if (options.channels) {
    args.push('-ac', String(options.channels))
  }
  if (options.sampleRate) {
    args.push('-ar', String(options.sampleRate))
  }
  if (options.bitrate) {
    args.push('-b:a', options.bitrate)
  }
  if (options.loudnessNormalization) {
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11')
  }
  if (options.extraArgs?.length) {
    args.push(...options.extraArgs)
  }
  args.push('{output}')
  return args
}

function defaultVideoArgs(format: Exclude<VideoPipelineFormat, 'source'>, options: VideoPipelineOptions): string[] {
  const args = ['-y', '-i', '{input}']
  if (options.width || options.height) {
    args.push('-vf', `scale=${options.width ?? -2}:${options.height ?? -2}`)
  }
  if (options.fps) {
    args.push('-r', String(options.fps))
  }
  const codec = options.codec ?? defaultVideoCodec(format)
  if (codec) {
    args.push('-c:v', codec)
  }
  const audioCodec = options.audioCodec ?? defaultVideoAudioCodec(format)
  if (audioCodec) {
    args.push('-c:a', audioCodec)
  }
  if (options.videoBitrate) {
    args.push('-b:v', options.videoBitrate)
  }
  else if (format === 'webm' && codec === 'libvpx-vp9') {
    args.push('-b:v', '0')
  }
  if (options.audioBitrate) {
    args.push('-b:a', options.audioBitrate)
  }
  const crf = options.crf ?? (format === 'webm' && codec === 'libvpx-vp9' ? 32 : undefined)
  if (crf !== undefined) {
    args.push('-crf', String(crf))
  }
  if (options.preset) {
    args.push('-preset', options.preset)
  }
  if (options.pixelFormat) {
    args.push('-pix_fmt', options.pixelFormat)
  }
  if (format === 'mp4' && options.fastStart !== false) {
    args.push('-movflags', '+faststart')
  }
  if (options.extraArgs?.length) {
    args.push(...options.extraArgs)
  }
  args.push('{output}')
  return args
}

function defaultAudioCodec(format: Exclude<AudioPipelineFormat, 'source'>): string | undefined {
  if (format === 'opus') {
    return 'libopus'
  }
  if (format === 'ogg') {
    return 'libvorbis'
  }
  if (format === 'mp3') {
    return 'libmp3lame'
  }
  if (format === 'aac' || format === 'm4a') {
    return 'aac'
  }
  return undefined
}

function defaultVideoCodec(format: Exclude<VideoPipelineFormat, 'source'>): string | undefined {
  if (format === 'mp4') {
    return 'libx264'
  }
  if (format === 'webm') {
    return 'libvpx-vp9'
  }
  return undefined
}

function defaultVideoAudioCodec(format: Exclude<VideoPipelineFormat, 'source'>): string | undefined {
  if (format === 'mp4') {
    return 'aac'
  }
  if (format === 'webm') {
    return 'libopus'
  }
  return undefined
}

function defaultFontArgs(format: FontPipelineFormat, options: FontPipelineOptions): string[] {
  const args = ['{input}', '--output-file={output}']
  if (format === 'woff2' || format === 'woff') {
    args.push(`--flavor=${format}`)
  }
  if (options.text) {
    args.push(`--text=${options.text}`)
  }
  if (options.unicodes?.length) {
    args.push(`--unicodes=${options.unicodes.join(',')}`)
  }
  if (options.glyphs?.length) {
    args.push(`--glyphs=${options.glyphs.join(',')}`)
  }
  return args
}

function imageExtension(format: Exclude<ImagePipelineFormat, 'source'>): string {
  return format === 'jpeg' ? '.jpg' : `.${format}`
}

function audioExtension(format: Exclude<AudioPipelineFormat, 'source'>): string {
  return format === 'opus' ? '.ogg' : `.${format}`
}

function videoExtension(format: Exclude<VideoPipelineFormat, 'source'>): string {
  return `.${format}`
}

function fontExtension(format: Exclude<FontPipelineFormat, 'source'>): string {
  return `.${format}`
}

function updateMediaFormat(metadata: MediaMetadata | undefined, format: string): MediaMetadata | undefined {
  return metadata ? { ...metadata, format: format.toUpperCase() } : undefined
}

function replaceExtension(path: string, extension: string): string {
  const current = extname(path)
  return current ? `${path.slice(0, -current.length)}${extension}` : `${path}${extension}`
}

function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.once('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error(`${basename(command)} timed out after ${timeoutMs}ms`))
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${basename(command)} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
