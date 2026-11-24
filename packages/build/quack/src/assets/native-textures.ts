import type { AssetInfo, NativeTextureOptions } from '../core/types'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { getQpkAssetPath } from '../bundlers/qpk-bundler'

const run = promisify(execFile)
const defaultPaths = ['images/backgrounds', 'images/cg', 'characters']

/** Keep source images intact for ordinary asset reads and devices without the GPU format. */
export async function buildNativeTextureVariants(assets: AssetInfo[], options: NativeTextureOptions): Promise<AssetInfo[]> {
  if (options.format === 'auto')
    throw new Error('Standalone native QPKs need an explicit astc or bc7 format. Project builds resolve auto from the artifact platform.')
  if (!['astc', 'bc7'].includes(options.format))
    throw new Error('nativeTextures.format must be astc or bc7.')
  const paths = options.paths ?? defaultPaths
  if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path || path.split('/').some(part => !part || part === '.' || part === '..')))
    throw new Error('nativeTextures.paths must contain source-relative file or directory names.')
  const result = [...assets]
  const names = new Set(assets.map(asset => asset.relativePath))
  const dir = await mkdtemp(join(tmpdir(), 'qua-textures-'))
  try {
    for (const asset of assets) {
      if (!['images', 'characters'].includes(asset.type) || !/\.(?:png|webp|jpe?g)$/i.test(asset.relativePath)
        || !paths.some(path => asset.relativePath === path || asset.relativePath.startsWith(`${path}/`))) {
        continue
      }
      const suffix = `.qua-${options.format}`
      const archivePath = getQpkAssetPath(asset).slice('assets/'.length)
      const name = `qua-native-textures/${archivePath}${suffix}`
      const relativePath = `data/${name}`
      if (names.has(relativePath))
        throw new Error(`Native texture variant collides with ${relativePath}`)
      const source = asset.content ? Buffer.from(asset.content) : await readFile(asset.path)
      const image = sharp(source, { limitInputPixels: 32 * 1024 * 1024 })
      const meta = await image.metadata()
      if ((meta.pages ?? 1) > 1)
        continue
      const { data, info } = await image.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
      const { width, height } = info
      if (width > 8192 || height > 8192)
        throw new Error(`Native texture exceeds supported dimensions: ${asset.relativePath}`)
      const sprite = asset.type === 'characters'
      const block = sprite || options.format === 'bc7' ? 4 : 6
      const canvas = prepareCanvas(data, width, height, sprite, block)
      const content = await encodeVariant(dir, options.ktx ?? 'ktx', options.format === 'bc7', block, canvas, relativePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT')
          throw new Error(`GPU texture encoding requires Khronos KTX-Software. Install ktx on PATH or set the ktx option to its executable path (${options.ktx ?? 'ktx'}).`, { cause: error })
        throw error
      })
      result.push({
        type: 'data',
        name,
        locales: asset.locales,
        version: asset.version,
        mtime: asset.mtime,
        path: relativePath,
        relativePath,
        content,
        size: content.length,
        hash: createHash('sha256').update(content).digest('hex'),
        mimeType: 'application/octet-stream',
      })
      names.add(relativePath)
    }
    return result
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

interface TextureCanvas {
  pixels: Buffer
  width: number
  height: number
  x: number
  y: number
  storedWidth: number
  storedHeight: number
}

async function encodeVariant(dir: string, binary: string, bc7: boolean, block: number, canvas: TextureCanvas, relativePath: string) {
  const { pixels, storedWidth, storedHeight } = canvas
  const png = join(dir, 'pixels.png')
  await sharp(pixels, { raw: { width: storedWidth, height: storedHeight, channels: 4 } }).png().toFile(png)
  const output = join(dir, 'blocks.ktx2')
  const basis = join(dir, 'basis.ktx2')
  const args = bc7 ? ['--format', 'R8G8B8A8_UNORM', '--encode', 'uastc'] : ['--format', `ASTC_${block}x${block}_UNORM_BLOCK`, '--astc-quality', 'medium']
  await run(binary, ['create', ...args, '--assign-tf', 'linear', '--generate-mipmap', '--mipmap-filter', 'box', '--mipmap-wrap', 'clamp', '--threads', '4', png, bc7 ? basis : output], { timeout: 300_000 })
  if (bc7)
    await run(binary, ['transcode', '--target', 'bc7', basis, output], { timeout: 300_000 })
  const format = bc7 ? 145 : block === 4 ? 157 : 165 // Vulkan UNORM format IDs.
  return packMipChain(await readFile(output), format, block, canvas, relativePath)
}

function packMipChain(ktx: Buffer, format: number, block: number, canvas: TextureCanvas, relativePath: string) {
  const { width, height, x, y, storedWidth, storedHeight } = canvas
  const levels = Math.floor(Math.log2(Math.max(storedWidth, storedHeight))) + 1
  if (ktx.readUInt32LE(12) !== format || ktx.readUInt32LE(20) !== storedWidth || ktx.readUInt32LE(24) !== storedHeight
    || ktx.readUInt32LE(40) !== levels || ktx.readUInt32LE(44) !== 0) {
    throw new Error(`Unexpected KTX encoder output for ${relativePath}`)
  }
  // Small QPK-specific header retains the original canvas. Mips follow largest first.
  const header = Buffer.alloc(32)
  header.write('QNT1')
  const fields = [format, width, height, x, y, storedWidth, storedHeight]
  fields.forEach((v, i) => header.writeUInt32LE(v, 4 + 4 * i))
  const parts: Buffer[] = [header]
  for (let level = 0; level < levels; level++) {
    const start = Number(ktx.readBigUInt64LE(80 + level * 24))
    const length = Number(ktx.readBigUInt64LE(88 + level * 24))
    const expected = 16 * Math.ceil(Math.max(1, storedWidth >> level) / block) * Math.ceil(Math.max(1, storedHeight >> level) / block)
    if (length !== expected || start + length > ktx.length)
      throw new Error(`Invalid KTX mip ${level} for ${relativePath}`)
    parts.push(ktx.subarray(start, start + length))
  }
  const content = Buffer.concat(parts)
  if (content.length > 64 * 1024 * 1024)
    throw new Error(`Native texture exceeds upload budget: ${relativePath}`)
  return content
}

function prepareCanvas(data: Buffer, width: number, height: number, trim: boolean, block: number): TextureCanvas {
  let x = width
  let y = height
  let right = 0
  let bottom = 0
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4
      const alpha = data[i + 3]!
      if (alpha !== 255) {
        for (let c = 0; c < 3; c++)
          data[i + c] = Math.floor((data[i + c]! * alpha + 127) / 255)
      }
      if (trim && alpha) {
        x = Math.min(x, col)
        y = Math.min(y, row)
        right = Math.max(right, col + 1)
        bottom = Math.max(bottom, row + 1)
      }
    }
  }
  if (!trim || !right) {
    x = 0
    y = 0
    right = trim ? 1 : width
    bottom = trim ? 1 : height
  }
  // Transparent guard texels isolate the silhouette when filtering at the crop boundary.
  x = Math.max(0, x - block)
  y = Math.max(0, y - block)
  right = Math.min(width, right + block)
  bottom = Math.min(height, bottom + block)
  const storedWidth = Math.ceil((right - x) / block) * block
  const storedHeight = Math.ceil((bottom - y) / block) * block
  const pixels = Buffer.alloc(storedWidth * storedHeight * 4)
  for (let row = 0; row < storedHeight; row++) {
    const from = (Math.min(bottom - 1, y + row) * width + x) * 4
    const to = row * storedWidth * 4
    data.copy(pixels, to, from, from + (right - x) * 4)
    for (let col = right - x; col < storedWidth; col++)
      data.copy(pixels, to + col * 4, from + (right - x - 1) * 4, from + (right - x) * 4)
  }
  return { pixels, width, height, x, y, storedWidth, storedHeight }
}
