import type { AssetContext } from '../src/core/types'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QPKBundler } from '../src/bundlers/qpk-bundler'
import { QuackBundler } from '../src/core/bundler'
import { ImageOptimizationPlugin } from '../src/plugins/image-optimization'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

describe('imageOptimizationPlugin', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `quack-image-optimization-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('recompresses PNG files without corrupting image bytes', async () => {
    const original = createPng({ width: 48, height: 48, zlibLevel: 0, includeText: true })
    const context = createImageContext(original)
    const plugin = new ImageOptimizationPlugin({
      sharp: false,
      pngquant: false,
      stripMetadata: true,
    })

    await plugin.processAsset(context)

    expect(context.buffer.length).toBeLessThan(original.length)
    expect(context.metadata.optimized).toBe(true)
    expect(context.metadata.optimizer).toBe('png-lossless')
    expect(context.metadata.lossy).toBe(false)
    expect(context.asset.size).toBe(context.buffer.length)
    expect(context.asset.hash).toBe(sha256(context.buffer))
    expect(Buffer.from(context.asset.content!)).toEqual(context.buffer)
    expectPngDataCanInflate(context.buffer)
  })

  it('can use an external pngquant-compatible binary when configured', async () => {
    const original = createPng({ width: 48, height: 48, zlibLevel: 0, includeText: true })
    const pngquantBinary = join(tempDir, 'pngquant-fake.mjs')
    const quantized = createPng({ width: 1, height: 1, zlibLevel: 9, includeText: false })

    await writeFile(
      pngquantBinary,
      `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
const outputIndex = process.argv.indexOf('--output')
if (outputIndex < 0 || !process.argv[outputIndex + 1]) process.exit(2)
writeFileSync(process.argv[outputIndex + 1], Buffer.from('${quantized.toString('base64')}', 'base64'))
`,
      'utf8',
    )
    await chmod(pngquantBinary, 0o755)

    const context = createImageContext(original)
    const plugin = new ImageOptimizationPlugin({
      sharp: false,
      pngquant: {
        enabled: true,
        binary: pngquantBinary,
        quality: [60, 90],
        speed: 1,
      },
    })

    await plugin.processAsset(context)

    expect(context.metadata.optimizer).toBe('pngquant')
    expect(context.metadata.lossy).toBe(true)
    expect(context.buffer).toEqual(quantized)
  })

  it('writes optimized image size and hash into the bundle manifest', async () => {
    const sourceDir = join(tempDir, 'assets')
    const outputDir = join(tempDir, 'dist')
    await mkdir(join(sourceDir, 'images'), { recursive: true })

    const original = createPng({ width: 48, height: 48, zlibLevel: 0, includeText: true })
    await writeFile(join(sourceDir, 'images', 'bg.png'), original)

    const bundler = new QuackBundler({
      source: sourceDir,
      output: join(outputDir, 'game.qpk'),
      format: 'qpk',
      compression: { algorithm: 'none', level: 0 },
      encryption: { enabled: false, algorithm: 'none' },
      versioning: { bundleVersion: 1, buildNumber: 'image-opt-test' },
      plugins: [
        new ImageOptimizationPlugin({
          sharp: false,
          pngquant: false,
          stripMetadata: true,
        }),
      ],
    })

    await bundler.bundle()

    const index = JSON.parse(await readFile(join(outputDir, 'index.json'), 'utf8'))
    const bundlePath = join(outputDir, index.latestBundle.filename)
    const { manifest, assets } = await new QPKBundler().readBundle(bundlePath)
    const bundledImage = assets.get('assets/images/bg.png')
    const manifestImage = manifest.assets.images['bg.png']

    expect(bundledImage).toBeDefined()
    expect(manifestImage.size).toBe(bundledImage!.length)
    expect(manifestImage.hash).toBe(sha256(bundledImage!))
    expect(manifestImage.size).toBeLessThan(original.length)
  })
})

function createImageContext(buffer: Buffer): AssetContext {
  return {
    asset: {
      name: 'bg.png',
      path: '/virtual/bg.png',
      relativePath: 'images/bg.png',
      size: buffer.length,
      hash: sha256(buffer),
      type: 'images',
      locales: ['default'],
      mimeType: 'image/png',
      mediaMetadata: {
        width: 48,
        height: 48,
        aspectRatio: 1,
        animated: false,
        format: 'PNG',
        colorDepth: 32,
        hasAlpha: true,
      },
    },
    buffer,
    metadata: {},
  }
}

function createPng(options: {
  width: number
  height: number
  zlibLevel: number
  includeText: boolean
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
    options.includeText ? createPngChunk('tEXt', Buffer.from(`Comment\0${'metadata'.repeat(200)}`, 'utf8')) : undefined,
    createPngChunk('IDAT', deflateSync(Buffer.concat(rows), { level: options.zlibLevel })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ].filter((chunk): chunk is Buffer => Boolean(chunk))

  return Buffer.concat([PNG_SIGNATURE, ...chunks])
}

function expectPngDataCanInflate(buffer: Buffer): void {
  const idat = Buffer.concat(readPngChunks(buffer)
    .filter(chunk => chunk.type === 'IDAT')
    .map(chunk => chunk.data))

  expect(inflateSync(idat).length).toBeGreaterThan(0)
}

function readPngChunks(buffer: Buffer): Array<{ type: string, data: Buffer }> {
  expect(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)

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

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
