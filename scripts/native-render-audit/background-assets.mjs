import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { QPKBundler, readQpkBundle } from '../../packages/build/quack/dist/index.js'

// Deterministic raster fixtures are bundled by Quack, then read back for both
// renderers. No test-only loose asset path is added to the native runtime.
export async function backgroundAuditAssets(demoQpk, output, assetType = 'images', additionalAssets = new Map()) {
  const original = await readQpkBundle(demoQpk)
  const files = new Map(['backgrounds/morning-city.jpg', 'cg/title.webp'].map(name => {
    const bytes = original.assets.get(`assets/images/${name}`)
    if (!bytes) throw new Error(`Missing QPK asset: ${name}`)
    return [name, bytes]
  }))
  files.set('masks/coverage.png', png(128, 64, (x, y) => {
    const alpha = Math.round(255 * Math.max(0, 1 - Math.hypot((x - 63.5) / 60, (y - 31.5) / 29)))
    // Colored transparent texels expose premultiplication and luminance bugs.
    return [x < 43 ? 255 : 0, x >= 43 && x < 85 ? 255 : 0, x >= 85 ? 255 : 0, alpha]
  }))
  files.set('masks/stripes.png', png(96, 96, (x, y) => [255, 255, 255, (x % 32 < 16 && y % 32 < 16) ? 255 : 0]))
  files.set('silhouette.png', png(128, 96, (x, y) => {
    const r = Math.hypot((x - 63.5) / 55, (y - 47.5) / 40)
    return [255, 175, 60, r < 1 && r > 0.4 ? (x < 64 ? 255 : 120) : 0]
  }))
  files.set('white.png', png(8, 8, () => [255, 255, 255, 255]))
  files.set('masks/clear.png', png(8, 8, () => [255, 0, 255, 0]))
  for (const [name, bytes] of additionalAssets) files.set(name, bytes)
  const assets = [...files].map(([name, bytes]) => {
    const path = resolve(output, 'assets', name)
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes)
    return { name, path, relativePath: name, type: assetType, subType: 'image',
      size: bytes.length, hash: createHash('sha256').update(bytes).digest('hex'), mtime: 0, locales: ['default'] }
  })
  const qpk = resolve(output, 'background-audit.qpk')
  await new QPKBundler().createBundle(assets, {
    name: 'background-audit', version: '1.0.0', bundler: 'quack', created: new Date(0).toISOString(), createdAt: 0,
    format: 'qpk', bundleVersion: 1, compression: { algorithm: 'none', level: 0 },
    encryption: { enabled: false, algorithm: 'none' }, locales: ['default'], defaultLocale: 'default',
    assets: [], totalFiles: assets.length, totalSize: assets.reduce((n, asset) => n + asset.size, 0),
  }, qpk, { compress: false, encrypt: false })
  const bundle = await readQpkBundle(qpk)
  const urls = Object.fromEntries([...files.keys()].map(name => [name,
    `data:image/${name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${bundle.assets.get(`assets/${assetType}/${name}`).toString('base64')}`]))
  return { qpk, urls }
}

export function png(width, height, pixel) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of body) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  const scanlines = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    scanlines.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4)
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))])
}
